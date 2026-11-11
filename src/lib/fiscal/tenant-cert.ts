/**
 * STORE de credenciales fiscales POR TENANT (ADR-066). Es el reemplazo de
 * `credencialDesdeEnv()` (env único compartido) en el camino de emisión REAL: cada tenant
 * firma con SU certificado, cifrado en reposo (envelope, `cert-crypto.ts`).
 *
 * Dos operaciones:
 *   - `credencialParaTenant(tenantId)`  → resuelve la credencial del emisor para firmar.
 *     Corre el GUARD FAIL-CLOSED: el CUIT del subject del cert descifrado tiene que
 *     coincidir con `Tenant.arcaCuit`; si no, ABORTA (nunca firma con el cert de otro).
 *     Sin credencial cargada → lanza (jamás cae a un env compartido).
 *   - `cargarCredencialTenant(...)`     → carga/rota la credencial (acción de OPERADOR,
 *     auditada). Valida los PEM, exige que el cert sea del CUIT del tenant, sella y
 *     persiste. NUNCA loguea ni devuelve el material.
 *
 * Deps inyectables (default: `operatorPrisma` + master key de env) → testeable offline sin
 * DB. El material NUNCA se expone a la app del tenant: se lee/escribe por el plano de
 * operador (`operatorPrisma`, cross-tenant).
 */

import forge from "node-forge";
import {
  type CredencialEmisor,
  assertCertCoincideConCuit,
  cuitDesdeCertPem,
  vencimientoDesdeCertPem,
} from "@/plugins/arca";
import type { PrismaClient } from "@/generated/prisma/client";
import { operatorPrisma, enElNegocio } from "@/lib/operator-db";
import { bloquearCuit, hayColumnaCuitVerificado, tenedoresDelCuit } from "@/lib/factoque/tenedores-del-cuit.server";
import { ACCION_PRUEBA_OK } from "@/lib/fiscal/contador-arca";
import {
  masterKeyDesdeEnv,
  sealCredential,
  openCredential,
  type MasterKey,
} from "./cert-crypto";

/** Lo que la tabla `TenantFiscalCredential` persiste (sin material en claro). */
export interface RegistroCredencialFiscal {
  certCuit: string;
  certNotAfter: Date | null;
  kekId: string;
  wrappedDek: string;
  sealed: string;
}

/** Entrada de auditoría de una carga/rotación (sin material sensible). */
export interface AuditoriaCredencial {
  tenantId: string;
  actor: string;
  action: "fiscal.credential.load" | "fiscal.credential.rotate";
  entityId: string | null;
  changes: Record<string, unknown>;
}

/** Seams inyectables. Default: operatorPrisma (cross-tenant) + master key de env. */
export interface TenantCertDeps {
  leerCuitTenant: (tenantId: string) => Promise<string | null>;
  leerRegistro: (tenantId: string) => Promise<RegistroCredencialFiscal | null>;
  guardarRegistro: (
    tenantId: string,
    reg: RegistroCredencialFiscal,
    loadedBy: string,
  ) => Promise<{ id: string; yaExistia: boolean }>;
  auditar: (entry: AuditoriaCredencial) => Promise<void>;
  master: () => MasterKey;
}

/** No hay credencial fiscal cargada para el tenant. Fail-closed: no se emite. */
export class CredencialFiscalAusenteError extends Error {
  constructor(readonly tenantId: string) {
    super(
      `El tenant ${tenantId} no tiene credencial fiscal (certificado ARCA) cargada. ` +
        `Cargala desde el plano de operador antes de emitir — no hay fallback a un cert ` +
        `compartido (ADR-066).`,
    );
    this.name = "CredencialFiscalAusenteError";
  }
}

/** El tenant no tiene `arcaCuit` cargado; sin CUIT no hay guard posible → no se opera. */
/**
 * Alta web de Factoque (aprobado por el dueño, 08/11/2026): un alta web sin verificar puede compartir
 * CUIT con otras, y se queda con él la PRIMERA que conecta ARCA. Ésta llegó tarde: otro negocio ya
 * cargó el certificado de ese CUIT.
 */
export class CuitVerificadoEnOtroNegocioError extends Error {
  constructor() {
    super("Ese CUIT ya está conectado con ARCA en otro negocio de Factoque. Si es tuyo, escribinos y lo revisamos.");
    this.name = "CuitVerificadoEnOtroNegocioError";
  }
}

/**
 * Guarda (o rota) la credencial parado en el negocio. Si el negocio vino del alta web, se pone en
 * fila por el CUIT (la misma llave que el alta) y se niega si otro negocio ya verificó ese CUIT (ARCA
 * le aceptó el certificado, ver `registrarPruebaArcaOk`). Cargar no verifica: verifica la prueba. Los negocios dados
 * de alta por GSG no cambian: un mismo contribuyente puede tener varios, con talonarios distintos.
 */
export async function guardarRegistroCredencial(
  tenantId: string,
  reg: RegistroCredencialFiscal,
  loadedBy: string,
  db: PrismaClient = operatorPrisma,
): Promise<{ id: string; yaExistia: boolean }> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    const web = await tx.auditLog.findFirst({
      where: { tenantId, action: "factoque.alta", actor: { startsWith: "web:" } },
      select: { id: true },
    });
    if (web) {
      await bloquearCuit(tx, reg.certCuit);
      const otros = await tenedoresDelCuit(tx, reg.certCuit, tenantId);
      if (otros.some((o) => o.verificado)) throw new CuitVerificadoEnOtroNegocioError();
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    }
    const existente = await tx.tenantFiscalCredential.findUnique({ where: { tenantId }, select: { id: true } });
    const row = await tx.tenantFiscalCredential.upsert({
      where: { tenantId },
      create: { tenantId, loadedBy, ...reg },
      update: { loadedBy, ...reg },
    });
    return { id: row.id, yaExistia: existente != null };
  });
}

/** La versión del certificado cargado (su `updatedAt`). Se toma ANTES de probar con ARCA y viaja a `registrarPruebaArcaOk`. */
export type CredencialProbada = { updatedAt: Date };

export async function versionDeLaCredencial(tenantId: string, db: PrismaClient = operatorPrisma): Promise<CredencialProbada | null> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return tx.tenantFiscalCredential.findUnique({ where: { tenantId }, select: { updatedAt: true } });
  });
}

/** Lo que ARCA aceptó ya no es lo cargado (se cambió el certificado o el CUIT mientras se probaba). */
export class PruebaDeOtroCertificadoError extends Error {
  constructor() {
    super("El certificado o el CUIT del negocio cambiaron mientras se probaba con ARCA. Probá de nuevo.");
    this.name = "PruebaDeOtroCertificadoError";
  }
}

/**
 * Anota que ARCA aceptó el certificado del negocio (el ingreso al WSAA salió bien). En PRODUCCIÓN eso verifica el
 * CUIT (D4, tenedores-del-cuit.server.ts), así que la prueba queda ATADA a lo probado (certificación 10/11): la
 * versión del certificado tomada antes de probar (`probada`) tiene que seguir siendo la vigente, y el certificado
 * tiene que ser del CUIT del negocio. Si no, no se anota nada y se tira `PruebaDeOtroCertificadoError`: sin esto,
 * cambiar el CUIT o el certificado durante una prueba en curso dejaba «verificado» uno que ARCA nunca vio.
 * En un alta web, además, bajo el candado del CUIT: gana el primero que verifica (`CuitVerificadoEnOtroNegocioError`).
 */
export async function registrarPruebaArcaOk(
  tenantId: string,
  actor: string,
  entorno: string,
  probada: CredencialProbada | null,
  db: PrismaClient = operatorPrisma,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    if (entorno !== "produccion") {
      // Homologación no verifica: se anota sólo para el pedido de asistencia.
      await tx.auditLog.create({
        data: { tenantId, actor, action: ACCION_PRUEBA_OK, entity: "Tenant", entityId: tenantId, changes: { entorno } },
      });
      return;
    }
    const [t, vigente, web] = await Promise.all([
      tx.tenant.findUnique({ where: { id: tenantId }, select: { arcaCuit: true } }),
      tx.tenantFiscalCredential.findUnique({ where: { tenantId }, select: { updatedAt: true, certCuit: true } }),
      tx.auditLog.findFirst({ where: { tenantId, action: "factoque.alta", actor: { startsWith: "web:" } }, select: { id: true } }),
    ]);
    const cuit = t?.arcaCuit;
    if (!probada || !vigente || !cuit || vigente.certCuit !== cuit || vigente.updatedAt.getTime() !== probada.updatedAt.getTime()) {
      throw new PruebaDeOtroCertificadoError();
    }
    if (web) {
      await bloquearCuit(tx, cuit);
      const otros = await tenedoresDelCuit(tx, cuit, tenantId);
      if (otros.some((o) => o.verificado)) throw new CuitVerificadoEnOtroNegocioError();
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    }
    // La versión exacta que ARCA aceptó: una carga posterior (aun a la vez que esto) tiene otra y deja de contar.
    const version = probada.updatedAt;
    await tx.auditLog.create({
      data: {
        tenantId,
        actor,
        action: ACCION_PRUEBA_OK,
        entity: "Tenant",
        entityId: tenantId,
        changes: { entorno, certificado: version.toISOString() },
      },
    });
    // D4: la marca, en la misma transacción. Sin la migración aplicada no se escribe: la auditoría verifica sola.
    if (await hayColumnaCuitVerificado(tx)) {
      await tx.$executeRaw`UPDATE "Tenant" SET "cuitVerificadoEn" = ${version} WHERE id = ${tenantId}`;
    }
  });
}

export class CuitTenantAusenteError extends Error {
  constructor(readonly tenantId: string) {
    super(
      `El tenant ${tenantId} no tiene arcaCuit configurado. Cargá el CUIT del emisor antes ` +
        `de cargar o usar el certificado (el guard fiscal compara el cert contra ese CUIT).`,
    );
    this.name = "CuitTenantAusenteError";
  }
}

function defaultDeps(): TenantCertDeps {
  return {
    leerCuitTenant: async (tenantId) => {
      const t = await operatorPrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { arcaCuit: true },
      });
      return t?.arcaCuit ?? null;
    },
    // La credencial y su auditoría son filas DEL negocio: con RLS se leen y escriben parado en él
    // (`enElNegocio`); sin eso, en producción la credencial «no existía» y la carga fallaba.
    leerRegistro: async (tenantId) => {
      const r = await enElNegocio(tenantId, (tx) =>
        tx.tenantFiscalCredential.findUnique({ where: { tenantId } }),
      );
      return r
        ? {
            certCuit: r.certCuit,
            certNotAfter: r.certNotAfter,
            kekId: r.kekId,
            wrappedDek: r.wrappedDek,
            sealed: r.sealed,
          }
        : null;
    },
    guardarRegistro: (tenantId, reg, loadedBy) => guardarRegistroCredencial(tenantId, reg, loadedBy),
    auditar: async (entry) => {
      await enElNegocio(entry.tenantId, (tx) =>
        tx.auditLog.create({
          data: {
            tenantId: entry.tenantId,
            actor: entry.actor,
            action: entry.action,
            entity: "TenantFiscalCredential",
            entityId: entry.entityId,
            changes: entry.changes as object,
          },
        }),
      );
    },
    master: masterKeyDesdeEnv,
  };
}

/**
 * Resuelve la credencial del emisor de un tenant para FIRMAR. Corre el guard fail-closed:
 * el cert descifrado tiene que ser del CUIT del tenant, o aborta. Nunca devuelve material
 * de otro CUIT y nunca cae a un env compartido.
 */
export async function credencialParaTenant(
  tenantId: string,
  deps: TenantCertDeps = defaultDeps(),
): Promise<CredencialEmisor> {
  const reg = await deps.leerRegistro(tenantId);
  if (!reg) throw new CredencialFiscalAusenteError(tenantId);

  const cuitTenant = await deps.leerCuitTenant(tenantId);
  if (!cuitTenant) throw new CuitTenantAusenteError(tenantId);

  const plano = openCredential(
    { kekId: reg.kekId, wrappedDek: reg.wrappedDek, sealed: reg.sealed },
    deps.master(),
  );

  // GUARD FAIL-CLOSED (ADR-066): el cert real (descifrado) debe ser del CUIT del tenant.
  // No confiamos solo en `certCuit` persistido: verificamos el subject del cert en sí.
  assertCertCoincideConCuit(plano.certPem, cuitTenant);

  return { certPem: plano.certPem, keyPem: plano.keyPem };
}

/** Verifica que la clave privada corresponda al certificado (mismo módulo RSA). */
function claveCorrespondeAlCert(certPem: string, keyPem: string): boolean {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;
    const pub = cert.publicKey as forge.pki.rsa.PublicKey;
    return pub.n.equals(key.n);
  } catch {
    return false;
  }
}

/**
 * Carga o rota la credencial fiscal de un tenant (acción de OPERADOR, auditada). Valida:
 *  - que cert y clave parseen y correspondan entre sí (fail-fast);
 *  - que el CUIT del subject del cert coincida con `Tenant.arcaCuit` (no se guarda el cert
 *    de otro contribuyente — el guard también acá, no solo al firmar).
 * Sella con la master key y persiste. Devuelve metadata NO sensible; nunca el material.
 */
export async function cargarCredencialTenant(
  input: { tenantId: string; certPem: string; keyPem: string; actor: string },
  deps: TenantCertDeps = defaultDeps(),
): Promise<{ certCuit: string; certNotAfter: Date | null; rotada: boolean }> {
  const { tenantId, certPem, keyPem, actor } = input;

  const cuitCert = cuitDesdeCertPem(certPem);
  if (!cuitCert) {
    throw new Error(
      "No se pudo leer el CUIT del subject del certificado. ¿Es un certificado ARCA válido " +
        "(PEM) con el CUIT en el serialNumber del subject?",
    );
  }
  if (!claveCorrespondeAlCert(certPem, keyPem)) {
    throw new Error("La clave privada no corresponde al certificado (o alguno no es un PEM válido).");
  }

  const cuitTenant = await deps.leerCuitTenant(tenantId);
  if (!cuitTenant) throw new CuitTenantAusenteError(tenantId);
  // No se guarda un cert cuyo CUIT no sea el del tenant (aislamiento en la carga, no solo al firmar).
  assertCertCoincideConCuit(certPem, cuitTenant);

  const certNotAfter = vencimientoDesdeCertPem(certPem);
  const sobre = sealCredential({ certPem, keyPem }, deps.master());
  const reg: RegistroCredencialFiscal = {
    certCuit: cuitCert,
    certNotAfter,
    kekId: sobre.kekId,
    wrappedDek: sobre.wrappedDek,
    sealed: sobre.sealed,
  };

  const { id, yaExistia } = await deps.guardarRegistro(tenantId, reg, actor);

  await deps.auditar({
    tenantId,
    actor,
    action: yaExistia ? "fiscal.credential.rotate" : "fiscal.credential.load",
    entityId: id,
    // SOLO metadata no sensible — NUNCA el cert ni la clave.
    changes: { certCuit: cuitCert, certNotAfter, kekId: sobre.kekId, rotada: yaExistia },
  });

  return { certCuit: cuitCert, certNotAfter, rotada: yaExistia };
}
