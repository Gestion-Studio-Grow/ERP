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
import { operatorPrisma } from "@/lib/operator-db";
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
    leerRegistro: async (tenantId) => {
      const r = await operatorPrisma.tenantFiscalCredential.findUnique({
        where: { tenantId },
      });
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
    guardarRegistro: async (tenantId, reg, loadedBy) => {
      const existente = await operatorPrisma.tenantFiscalCredential.findUnique({
        where: { tenantId },
        select: { id: true },
      });
      const row = await operatorPrisma.tenantFiscalCredential.upsert({
        where: { tenantId },
        create: { tenantId, loadedBy, ...reg },
        update: { loadedBy, ...reg },
      });
      return { id: row.id, yaExistia: existente != null };
    },
    auditar: async (entry) => {
      await operatorPrisma.auditLog.create({
        data: {
          tenantId: entry.tenantId,
          actor: entry.actor,
          action: entry.action,
          entity: "TenantFiscalCredential",
          entityId: entry.entityId,
          changes: entry.changes as object,
        },
      });
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
