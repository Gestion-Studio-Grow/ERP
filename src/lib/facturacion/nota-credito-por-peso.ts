// ============================================================================
// NOTA DE CRÉDITO POR LA DEVOLUCIÓN POR PESO — la emisión (SIMULADA), en su propia transacción.
// ============================================================================
//
// La anota pendiente el ajuste (nota-credito-por-peso-core.ts, misma tx que el EGRESO). Acá se
// emite con el Core de siempre (`crearNotaDeCreditoInTx`: misma letra y receptor, FOR UPDATE de la
// factura, nunca más que el saldo) y viaja por el outbox; el despacho en modo prueba la autoriza
// con el simulador (CAE «STUB…»), sin hablar con ARCA.
//
//   · IDEMPOTENTE: candado advisory por la clave (pedido + egreso) y, bajo el candado, si ya hay
//     `nc_peso_emitida` se devuelve ESA nota. Un segundo intento no emite otra.
//   · NUNCA MÁS QUE LO FACTURADO PENDIENTE: lo devuelto se recorta al `saldoPorAnular` de la factura.
//   · SI FALLA, la devolución de la caja ya está hecha (otra tx): queda `nc_peso_pendiente` y se
//     reintenta (el próximo «Pesar y ajustar» del pedido o `reintentarNotasPorPesoPendientes`).
//   · SÓLO MODO PRUEBA: factura con CAE simulado y el negocio en stub; si no, no se emite.

import { tenantTransaction } from "@/lib/rls";
import { idsDeLosNegocios } from "@/lib/cron/negocios";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { crearNotaDeCreditoInTx, type InvoiceTx } from "@/lib/invoice-core";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { caeEsSimulado } from "@/lib/fiscal/guarda-simulado";
import { tomarClaves } from "@/lib/facturacion/cobros-facturados";
import { modoEnPantalla } from "@/lib/facturacion/modo-en-pantalla";
import {
  ACCION_NC_PESO_CERRADA,
  ACCION_NC_PESO_EMITIDA,
  ACCION_NC_PESO_PENDIENTE,
  ACCION_NC_PESO_RECHAZADA,
  ENTIDAD_NC_POR_PESO,
  importeDeLaNota,
  type NotaPorPeso,
} from "@/lib/facturacion/nota-credito-por-peso-core";

type Pendiente = { orderId: string; facturaId: string; importe: number; code: number };

function leerPendiente(changes: unknown): Pendiente | null {
  const c = (changes && typeof changes === "object" ? changes : {}) as Record<string, unknown>;
  if (typeof c.orderId !== "string" || typeof c.facturaId !== "string" || typeof c.importe !== "number") return null;
  return { orderId: c.orderId, facturaId: c.facturaId, importe: c.importe, code: Number(c.code) || 0 };
}

async function anotar(tx: InvoiceTx, tenantId: string, clave: string, action: string, changes: Record<string, unknown>) {
  await tx.auditLog.create({
    data: { tenantId, actor: "system", action, entity: ENTIDAD_NC_POR_PESO, entityId: clave, channel: "admin", changes: JSON.parse(JSON.stringify(changes)) },
  });
}

/**
 * Emite (simulada) la nota pendiente de `clave`, en la tx del llamador. Nunca lanza por un dato:
 * devuelve el estado. `null` = no hay nada anotado con esa clave en este negocio.
 */
export async function notaDeCreditoPorPesoInTx(tx: InvoiceTx, tenantId: string, clave: string): Promise<NotaPorPeso | null> {
  await tomarClaves(tx, tenantId, [clave]);
  const filas = await tx.auditLog.findMany({
    where: { tenantId, entity: ENTIDAD_NC_POR_PESO, entityId: clave },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { action: true, changes: true },
  });
  const p = leerPendiente(filas.find((f) => f.action === ACCION_NC_PESO_PENDIENTE)?.changes);
  if (!p) return null;
  const emitida = filas.find((f) => f.action === ACCION_NC_PESO_EMITIDA)?.changes as { notaId?: string; importe?: number } | undefined;
  if (emitida?.notaId) return { estado: "emitida", clave, importe: Number(emitida.importe) || p.importe, invoiceId: emitida.notaId, yaExistia: true };
  const cerrada = filas.find((f) => f.action === ACCION_NC_PESO_CERRADA)?.changes as { motivo?: string } | undefined;
  if (cerrada) return { estado: "rechazada", clave, importe: p.importe, motivo: String(cerrada.motivo ?? "") };

  const rechazar = async (motivo: string, definitivo: boolean, importe = p.importe): Promise<NotaPorPeso> => {
    // Un rastro de rechazo por clave (el reintento no lo repite); el cierre, sólo si es definitivo.
    if (!filas.some((f) => f.action === ACCION_NC_PESO_RECHAZADA)) {
      await anotar(tx, tenantId, clave, ACCION_NC_PESO_RECHAZADA, { orderId: p.orderId, importe, motivo, definitivo });
    }
    if (definitivo) await anotar(tx, tenantId, clave, ACCION_NC_PESO_CERRADA, { motivo });
    return { estado: "rechazada", clave, importe, motivo };
  };

  const factura = await tx.invoice.findFirst({
    where: { tenantId, id: p.facturaId },
    select: { status: true, cae: true, total: true },
  });
  if (!factura || factura.status !== "AUTHORIZED") return rechazar("La factura del pedido ya no está autorizada.", true);
  // Sólo simulada: una factura con CAE real nunca recibe acá una nota (la emite el contador).
  if (!caeEsSimulado(factura.cae)) return rechazar("La factura del pedido es real ante ARCA: la nota de crédito la emite tu contador.", true);

  const notas = await tx.invoice.findMany({
    where: { tenantId, comprobanteAsociadoId: p.facturaId, status: { in: ["PENDING", "AUTHORIZED"] } },
    select: { total: true },
  });
  const importe = importeDeLaNota(p.importe, Number(factura.total), sumarAlCentavo(notas.map((n) => Number(n.total))));
  if (importe <= 0) return rechazar("La factura del pedido ya está anulada entera con notas de crédito.", true, 0);

  const fecha = fechaFiscalDelDia();
  const nota = await crearNotaDeCreditoInTx(tx, {
    tenantId,
    facturaId: p.facturaId,
    importe,
    motivo: `devolución por peso real del pedido #${p.code}`,
    fecha,
    fechaDeEnvio: fecha,
  });
  if (!nota.ok) return rechazar(nota.error, /ya está anulada entera/.test(nota.error), importe);
  await anotar(tx, tenantId, clave, ACCION_NC_PESO_EMITIDA, {
    orderId: p.orderId,
    facturaId: p.facturaId,
    notaId: nota.invoiceId,
    importe,
    devuelto: p.importe,
    simulada: true,
  });
  return { estado: "emitida", clave, importe, invoiceId: nota.invoiceId, yaExistia: false };
}

export type DepsNotaPorPeso = {
  /** ¿El negocio factura en modo prueba (stub)? Si no, no se emite (queda pendiente). */
  enModoPrueba: (tenantId: string) => Promise<boolean>;
  /** El tick del despacho: el simulador le pone el CAE a la nota. Su falla no importa (lo toma el próximo). */
  procesarEnviosDelNegocio: (tenantId: string) => Promise<unknown>;
};

/** ¿Este negocio está en modo prueba? Falla cerrada: si no se pudo leer, no. */
export async function negocioEnModoPrueba(tenantId: string): Promise<boolean> {
  const { resolverModoDelNegocio } = await import("@/lib/arca-dispatch");
  const m = modoEnPantalla(await resolverModoDelNegocio(tenantId).catch(() => null));
  return m.noFactura == null && m.modo === "stub";
}

const DEPS: DepsNotaPorPeso = {
  enModoPrueba: negocioEnModoPrueba,
  procesarEnviosDelNegocio: async (tenantId) => (await import("@/lib/arca-dispatch")).procesarEnviosDelNegocio(tenantId),
};

/** `notaDeCreditoPorPesoInTx` en su propia transacción (RLS del negocio) + el tick del simulador. */
export async function notaDeCreditoPorPeso(
  tenantId: string,
  clave: string,
  deps: DepsNotaPorPeso = DEPS,
): Promise<NotaPorPeso | null> {
  if (!(await deps.enModoPrueba(tenantId))) return null;
  const r = await tenantTransaction((tx) => notaDeCreditoPorPesoInTx(tx, tenantId, clave), { tenantId });
  if (r?.estado === "emitida" && !r.yaExistia) await deps.procesarEnviosDelNegocio(tenantId).catch(() => undefined);
  return r;
}

/** Vuelve a probar las notas por peso pendientes del negocio (las más viejas primero). */
export async function reintentarNotasPorPesoPendientes(
  tenantId: string,
  opciones: { limite?: number; deps?: DepsNotaPorPeso } = {},
): Promise<{ probadas: number; emitidas: number; rechazadas: number; errores: number }> {
  const deps = opciones.deps ?? DEPS;
  const r = { probadas: 0, emitidas: 0, rechazadas: 0, errores: 0 };
  if (!(await deps.enModoPrueba(tenantId))) return r;
  const claves = await tenantTransaction(
    async (tx) => {
      // Primero las PENDIENTES y después, sólo para esas claves, cuáles ya se emitieron o cerraron:
      // leer las N filas más viejas de la entidad y filtrar después dejaba afuera a las pendientes
      // nuevas en cuanto el negocio acumulaba notas emitidas (certificación, hallazgo 1).
      const pendientes = await tx.auditLog.findMany({
        where: { tenantId, entity: ENTIDAD_NC_POR_PESO, action: ACCION_NC_PESO_PENDIENTE, entityId: { not: null } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1000,
        select: { entityId: true },
      });
      const clavesPendientes = [...new Set(pendientes.map((f) => f.entityId!))];
      if (clavesPendientes.length === 0) return [];
      const cerradas = await tx.auditLog.findMany({
        where: {
          tenantId,
          entity: ENTIDAD_NC_POR_PESO,
          action: { in: [ACCION_NC_PESO_EMITIDA, ACCION_NC_PESO_CERRADA] },
          entityId: { in: clavesPendientes },
        },
        select: { entityId: true },
      });
      const fuera = new Set(cerradas.map((f) => f.entityId));
      return clavesPendientes.filter((c) => !fuera.has(c)).slice(0, opciones.limite ?? 20);
    },
    { tenantId },
  );
  for (const clave of claves) {
    r.probadas++;
    try {
      const n = await notaDeCreditoPorPeso(tenantId, clave, deps);
      if (n?.estado === "emitida") r.emitidas++;
      else if (n?.estado === "rechazada") r.rechazadas++;
    } catch {
      r.errores++;
    }
  }
  return r;
}

/** Todos los negocios, cada uno parado en el suyo. La falla de uno no frena a los demás. */
export async function reintentarNotasPorPesoDeLosNegocios(
  ids: () => Promise<readonly string[]> = idsDeLosNegocios,
): Promise<{ negocios: number; emitidas: number; rechazadas: number; errores: number }> {
  const total = { negocios: 0, emitidas: 0, rechazadas: 0, errores: 0 };
  for (const tenantId of await ids()) {
    total.negocios++;
    try {
      const r = await reintentarNotasPorPesoPendientes(tenantId);
      total.emitidas += r.emitidas;
      total.rechazadas += r.rechazadas;
      total.errores += r.errores;
    } catch {
      total.errores++;
    }
  }
  return total;
}
