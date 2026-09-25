// ============================================================================
// PASE A FACTURACIÓN REAL — la lectura de la ficha fiscal y la escritura REAL (servidor, R2-F5)
// ============================================================================
//
// La decisión vive en ./pase-a-real.ts (pura). Acá está lo que toca la base y el certificado:
//   · `leerFichaDelPase`: la ficha fiscal del negocio, leída por id con `operatorPrisma`, más quién
//     firmó su certificado (se abre con la misma guardia que al facturar, `credencialParaTenant`, y
//     del certificado sólo sale el emisor: nada del material se devuelve ni se registra), y cuántos
//     comprobantes de la etapa de pruebas quedan (esperando CAE, con el envío abierto o autorizados
//     en pruebas: la sexta condición). Se lee con el negocio fijado en la transacción
//     (`app.current_tenant_id`), así una conexión sujeta a RLS no cuenta cero por no ver las filas.
//   · `aplicarPase`: decide con una lectura previa (el descifrado queda FUERA de la transacción) y
//     escribe adentro de una transacción que bloquea la fila del negocio, la de su certificado y la
//     de su delegación, relee (también el conteo de comprobantes de prueba) y vuelve a decidir. Así dos confirmaciones a la vez dejan un solo
//     cambio y una sola fila de AuditLog, y una ficha que cambió en el medio no pasa.
//
// NO lleva "use server": sus funciones reciben un tenantId, y como endpoint serían una puerta para
// pasar un negocio a real sin sesión de operador. La única que lo llama es la action de la consola
// (src/lib/operator-actions.ts, `cambiarFacturacionReal`), DESPUÉS de `requireOperadorParaNegocio`.
// `server-only`: importa `operatorPrisma` y el descifrado del certificado.

import "server-only";
import forge from "node-forge";
import { operatorPrisma } from "@/lib/operator-db";
import {
  credencialParaTenant,
  CredencialFiscalAusenteError,
  CuitTenantAusenteError,
} from "@/lib/fiscal/tenant-cert";
import { CredencialCuitMismatchError } from "@/plugins/arca/afip/cert-inspect";
import { opcionesDeTransaccionConCandado } from "@/app/operador/(console)/tenants/[id]/negocio.server";
import { motivoDeCorte } from "@/lib/operador/corte-de-transaccion";
import { OUTBOX_INVOICE_CREATED } from "@/lib/invoice-core";
import type { ModoArcaPlataforma } from "./checklist-apertura";
import {
  cambiosParaAuditoria,
  decidirPase,
  entornoDelEmisor,
  FICHA_CAMBIO_MIENTRAS_MIRABAS,
  type AccionDePase,
  type ComprobantesDePrueba,
  type CredencialDelPase,
  type DelegacionDelPase,
  type FichaFiscalDelPase,
  type OperadorDelPase,
  type PedidoDePase,
} from "./pase-a-real";

/** Las acciones que deja AuditLog (una por sentido). */
export const ACCION_AUDITORIA: Readonly<Record<AccionDePase, string>> = {
  "pasar-a-real": "fiscal.pase-a-real",
  "volver-a-pruebas": "fiscal.vuelta-a-pruebas",
};

export type ResultadoDelPase =
  | { tipo: "aplicado"; accion: AccionDePase; mensaje: string }
  | { tipo: "sin-cambios"; mensaje: string }
  | { tipo: "rechazado"; motivo: string }
  | { tipo: "no-existe" };

const MENSAJE_APLICADO: Readonly<Record<AccionDePase, string>> = {
  "pasar-a-real":
    "Listo: el negocio pasó a facturación real. Lo que se facture desde ahora sale con CAE de ARCA y tiene validez fiscal.",
  "volver-a-pruebas":
    "Listo: el negocio volvió a facturar en pruebas (homologación). Lo que se facture desde ahora no tiene validez fiscal.",
};

/** Lo que se compara para saber si el certificado es el mismo que se abrió (nunca sale de acá). */
type SelloDelCertificado = { certCuit: string; actualizada: string; sealed: string; wrappedDek: string; kekId: string };

type Lector = Pick<
  typeof operatorPrisma,
  "tenant" | "tenantFiscalCredential" | "delegacionFiscal" | "invoice" | "outboxEvent" | "auditLog"
>;

interface FilasFiscales {
  tenant: {
    slug: string;
    arcaCuit: string | null;
    arcaPuntoVenta: number | null;
    arcaHomologacion: boolean;
    arcaCondicionIva: string | null;
  };
  sello: SelloDelCertificado | null;
  delegacion: DelegacionDelPase | null;
  comprobantes: ComprobantesDePrueba;
}

/**
 * Los comprobantes que dejó la etapa de pruebas de hoy. Empieza en la última vuelta a pruebas
 * registrada (el mismo criterio que el impreso, src/lib/comprobante-pdf-datos.ts: el AuditLog del
 * negocio con `changes.arcaHomologacion.despues`), o desde siempre si nunca volvió. Autorizado =
 * `authorizedAt`, o `createdAt` si falta (el CAE llegó después). En el mismo instante que la vuelta
 * cuenta como de pruebas: ante la duda, se niega.
 */
async function contarComprobantesDePrueba(db: Lector, tenantId: string): Promise<ComprobantesDePrueba> {
  const vuelta = await db.auditLog.findFirst({
    where: {
      tenantId,
      entity: "Tenant",
      entityId: tenantId,
      changes: { path: ["arcaHomologacion", "despues"], equals: true },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const desde = vuelta?.createdAt ?? null;
  const [esperandoCae, enviosAbiertos, autorizados] = await Promise.all([
    db.invoice.count({ where: { tenantId, status: "PENDING" } }),
    db.outboxEvent.count({ where: { tenantId, type: OUTBOX_INVOICE_CREATED, processedAt: null } }),
    db.invoice.count({
      where: {
        tenantId,
        status: "AUTHORIZED",
        ...(desde
          ? { OR: [{ authorizedAt: { gte: desde } }, { authorizedAt: null, createdAt: { gte: desde } }] }
          : {}),
      },
    }),
  ]);
  return { esperandoCae, enviosAbiertos, autorizados, desde: desde ? desde.toISOString() : null };
}

async function leerFilas(db: Lector, tenantId: string): Promise<FilasFiscales | null> {
  const [tenant, cred, deleg] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, arcaCuit: true, arcaPuntoVenta: true, arcaHomologacion: true, arcaCondicionIva: true },
    }),
    db.tenantFiscalCredential.findUnique({
      where: { tenantId },
      select: { certCuit: true, updatedAt: true, sealed: true, wrappedDek: true, kekId: true },
    }),
    db.delegacionFiscal.findUnique({
      where: { tenantId_servicio: { tenantId, servicio: "wsfe" } },
      select: { estado: true, cuitRepresentado: true, verificadaEn: true },
    }),
  ]);
  if (!tenant) return null;
  return {
    tenant,
    comprobantes: await contarComprobantesDePrueba(db, tenantId),
    sello: cred
      ? {
          certCuit: cred.certCuit,
          actualizada: cred.updatedAt.toISOString(),
          sealed: cred.sealed,
          wrappedDek: cred.wrappedDek,
          kekId: cred.kekId,
        }
      : null,
    delegacion: deleg
      ? {
          estado: deleg.estado,
          cuitRepresentado: deleg.cuitRepresentado,
          verificadaEn: deleg.verificadaEn ? deleg.verificadaEn.toISOString() : null,
        }
      : null,
  };
}

/** Por qué no se pudo abrir el certificado, dicho sin secretos ni detalles internos. */
function motivoSinSecretos(e: unknown): string {
  if (e instanceof CuitTenantAusenteError) return "falta el CUIT del negocio.";
  if (e instanceof CredencialCuitMismatchError) return "el certificado guardado no es del CUIT del negocio.";
  if (e instanceof CredencialFiscalAusenteError) return "no hay certificado guardado.";
  return "no se pudo descifrar ni leer. Revisá que la clave maestra de la plataforma sea la misma con la que se cargó.";
}

function textoDelCampo(campo: unknown): string | null {
  const v = (campo as { value?: unknown } | null | undefined)?.value;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Abre el certificado con la guardia de siempre y devuelve SÓLO quién lo firmó. */
async function entornoDelCertificado(tenantId: string): Promise<Pick<CredencialDelPase, "entorno" | "emisor" | "error">> {
  try {
    const { certPem } = await credencialParaTenant(tenantId);
    const issuer = forge.pki.certificateFromPem(certPem).issuer;
    const cn = textoDelCampo(issuer.getField("CN"));
    const o = textoDelCampo(issuer.getField("O"));
    const emisor = [cn, o].filter((x): x is string => !!x).join(" · ") || null;
    return { entorno: entornoDelEmisor({ cn, o }), emisor, error: null };
  } catch (e) {
    return { entorno: "desconocido", emisor: null, error: motivoSinSecretos(e) };
  }
}

function fichaDesde(
  filas: FilasFiscales,
  certificado: Pick<CredencialDelPase, "entorno" | "emisor" | "error"> | null,
  modoArca: ModoArcaPlataforma,
): FichaFiscalDelPase {
  return {
    ...filas.tenant,
    credencial:
      filas.sello && certificado
        ? { certCuit: filas.sello.certCuit, actualizada: filas.sello.actualizada, ...certificado }
        : null,
    delegacion: filas.delegacion,
    modoArca,
    comprobantesDePrueba: filas.comprobantes,
  };
}

function mismoSello(a: SelloDelCertificado | null, b: SelloDelCertificado | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.certCuit === b.certCuit &&
    a.actualizada === b.actualizada &&
    a.sealed === b.sealed &&
    a.wrappedDek === b.wrappedDek &&
    a.kekId === b.kekId
  );
}

async function leerFichaConSello(
  tenantId: string,
  modoArca: ModoArcaPlataforma,
): Promise<{ ficha: FichaFiscalDelPase; sello: SelloDelCertificado | null } | null> {
  const filas = await operatorPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return leerFilas(tx, tenantId);
  });
  if (!filas) return null;
  const certificado = filas.sello ? await entornoDelCertificado(tenantId) : null;
  return { ficha: fichaDesde(filas, certificado, modoArca), sello: filas.sello };
}

/** La ficha fiscal del negocio para la consola (null si no existe). */
export async function leerFichaDelPase(tenantId: string, modoArca: ModoArcaPlataforma): Promise<FichaFiscalDelPase | null> {
  return (await leerFichaConSello(tenantId, modoArca))?.ficha ?? null;
}

/** La espera del bloqueo: la de `opcionesDeTransaccionConCandado` menos su margen de 7 s. */
function esperaDelBloqueoMs(): number {
  return Math.max(1, opcionesDeTransaccionConCandado().timeout - 7_000);
}

function resultadoSinEscribir(d: ReturnType<typeof decidirPase>): ResultadoDelPase | null {
  if (d.tipo === "rechazado") return { tipo: "rechazado", motivo: d.motivo };
  if (d.tipo === "sin-cambios") return { tipo: "sin-cambios", mensaje: d.motivo };
  return null;
}

/**
 * Pasa el negocio a real o lo vuelve a pruebas, si la decisión lo deja con la ficha RELEÍDA bajo
 * bloqueo. Deja una fila de AuditLog por cambio. Nunca escribe nada si la respuesta no es "aplicado".
 */
export async function aplicarPase(
  operador: OperadorDelPase,
  tenantId: string,
  pedido: PedidoDePase,
  modoArca: ModoArcaPlataforma,
): Promise<ResultadoDelPase> {
  // 1. Lectura previa, con el certificado abierto FUERA de la transacción.
  const previa = await leerFichaConSello(tenantId, modoArca);
  if (!previa) return { tipo: "no-existe" };
  const primera = decidirPase(previa.ficha, pedido, operador);
  const corta = resultadoSinEscribir(primera);
  if (corta) return corta;

  // 2. Bajo bloqueo: relectura, misma decisión y escritura condicional.
  try {
    return await operatorPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      // La misma espera acotada que el candado de las apps (negocio.server.ts): si otro operador tiene
      // la fila, se corta con un error que `motivoDeCorte` reconoce en vez de colgar la transacción.
      await tx.$executeRaw`SELECT set_config('lock_timeout', ${String(esperaDelBloqueoMs())}, true)`;
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "TenantFiscalCredential" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "DelegacionFiscal" WHERE "tenantId" = ${tenantId} AND servicio = 'wsfe' FOR UPDATE`;

      const filas = await leerFilas(tx, tenantId);
      if (!filas) return { tipo: "no-existe" } as const;
      // El certificado que se abrió afuera tiene que ser, byte a byte, el que está ahora.
      if (!mismoSello(previa.sello, filas.sello)) {
        return { tipo: "rechazado", motivo: FICHA_CAMBIO_MIENTRAS_MIRABAS } as const;
      }
      const ahora = fichaDesde(filas, previa.ficha.credencial, modoArca);
      const d = decidirPase(ahora, pedido, operador);
      const sinEscribir = resultadoSinEscribir(d);
      if (sinEscribir) return sinEscribir;
      if (d.tipo !== "aplicar") return { tipo: "rechazado", motivo: FICHA_CAMBIO_MIENTRAS_MIRABAS } as const;

      const escrito = await tx.tenant.updateMany({
        where: {
          id: tenantId,
          arcaHomologacion: ahora.arcaHomologacion,
          arcaCuit: ahora.arcaCuit,
          arcaPuntoVenta: ahora.arcaPuntoVenta,
          arcaCondicionIva: ahora.arcaCondicionIva,
        },
        data: { arcaHomologacion: d.homologacion },
      });
      if (escrito.count !== 1) return { tipo: "rechazado", motivo: FICHA_CAMBIO_MIENTRAS_MIRABAS } as const;

      await tx.auditLog.create({
        data: {
          tenantId,
          actor: `operator:${operador.nombre}`,
          action: ACCION_AUDITORIA[d.accion],
          entity: "Tenant",
          entityId: tenantId,
          changes: cambiosParaAuditoria(ahora, d) as object,
        },
      });
      return { tipo: "aplicado", accion: d.accion, mensaje: MENSAJE_APLICADO[d.accion] } as const;
    }, opcionesDeTransaccionConCandado());
  } catch (e) {
    // Bloqueo ocupado o base que no respondió: un motivo legible en vez del error crudo.
    const motivo = motivoDeCorte(e);
    if (motivo) return { tipo: "rechazado", motivo };
    throw e;
  }
}
