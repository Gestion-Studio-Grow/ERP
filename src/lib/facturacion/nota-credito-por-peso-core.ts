// ============================================================================
// NOTA DE CRÉDITO POR LA DEVOLUCIÓN POR PESO (Magra) — núcleo PURO + la anotación en la tx del ajuste.
// ============================================================================
//
// Un pedido cobrado y FACTURADO que pesó menos devuelve la diferencia en la caja
// (ajuste-peso-cobrado.ts). La factura quedaba por el total viejo: falta la NOTA DE CRÉDITO por lo
// devuelto. Esta parte decide si corresponde y la deja ANOTADA como pendiente en la MISMA tx del
// ajuste; la emisión va en su propia tx (nota-credito-por-peso.ts), así una NC que falla nunca
// revierte la devolución de la caja: queda pendiente y se reintenta (patrón de devoluciones-mp.ts).
//
// SÓLO SIMULADA. Se emite únicamente sobre una factura con CAE del simulador («STUB…», el modo
// prueba de src/plugins/arca/afip/stub.ts) y con el negocio en modo prueba (`modoEnPantalla`): la
// nota viaja por el mismo outbox y la autoriza el simulador, sin hablar con ARCA. Una factura real
// sigue como antes: el ajuste se rechaza («facturada») y la NC la emite el contador.
//
// Sin migración: el rastro y la idempotencia van a `AuditLog` (entidad `NotaCreditoPorPeso`, una
// clave por pedido + egreso del ajuste), bajo candado advisory por clave.

import { centavosDe } from "@/lib/dinero/redondeo";
import { fmtMoneyARS } from "@/components/ui/format";
import { caeEsSimulado } from "@/lib/fiscal/guarda-simulado";
import { saldoPorAnular } from "@/lib/facturacion/nota-credito-core";
import type { Prisma } from "@/generated/prisma/client";

export const ENTIDAD_NC_POR_PESO = "NotaCreditoPorPeso";
export const ACCION_NC_PESO_PENDIENTE = "nc_peso_pendiente";
export const ACCION_NC_PESO_EMITIDA = "nc_peso_emitida";
export const ACCION_NC_PESO_RECHAZADA = "nc_peso_rechazada";
export const ACCION_NC_PESO_CERRADA = "nc_peso_cerrada";
/** Un intento fallido por un rechazo NO definitivo (uno por corrida): ordena la cola y la cierra a los N. */
export const ACCION_NC_PESO_INTENTO = "nc_peso_intento";
/**
 * Intentos fallidos (rechazos no definitivos) antes de cerrar la nota para que la vea un humano en
 * Facturación. Una falla que LANZA (base, red, ARCA caído) revierte la tx y no cuenta: se reintenta siempre.
 */
export const MAX_INTENTOS_NC_PESO = 5;

/** Clave de la nota: una por pedido y por ajuste (el EGRESO de la devolución). */
export function claveNotaPorPeso(orderId: string, egresoId: string): string {
  return `ajuste-peso:nc:${orderId}:${egresoId}`;
}

/** Qué pasó con la nota de crédito de una devolución por peso (va en el resultado del ajuste). */
export type NotaPorPeso =
  /** La venta no tenía factura: no hay nada que acreditar. */
  | { estado: "sin-factura" }
  /** Anotada; todavía no se emitió (se reintenta sola). */
  | { estado: "pendiente"; clave: string; importe: number }
  | { estado: "emitida"; clave: string; importe: number; invoiceId: string; yaExistia: boolean }
  | { estado: "rechazada"; clave: string; importe: number; motivo: string };

/** La factura del pedido, vista para la nota. */
export type FacturaParaLaNota =
  | { estado: "sin-factura-viva" }
  | { estado: "en-camino" }
  /** Autorizada por ARCA de verdad (o el negocio no está en modo prueba): sin NC automática. */
  | { estado: "autorizada" }
  /** Autorizada por el simulador y el negocio en modo prueba: admite la NC simulada. */
  | { estado: "simulada"; facturaId: string };

/**
 * La factura del pedido para la nota. PURA. Las notas de crédito no llevan `orderId` (no son
 * facturas del pedido), pero por las dudas se descartan las que tienen comprobante asociado.
 */
export function facturaParaLaNota(
  facturas: readonly { id: string; status: string; cae: string | null; comprobanteAsociadoId?: string | null }[],
  negocioEnModoPrueba: boolean,
): FacturaParaLaNota {
  const vivas = facturas.filter((f) => f.status !== "REJECTED" && !f.comprobanteAsociadoId);
  if (vivas.length === 0) return { estado: "sin-factura-viva" };
  const autorizadas = vivas.filter((f) => f.status === "AUTHORIZED");
  if (autorizadas.length === 0) return { estado: "en-camino" };
  if (vivas.length !== 1 || !negocioEnModoPrueba || !caeEsSimulado(autorizadas[0].cae)) return { estado: "autorizada" };
  return { estado: "simulada", facturaId: autorizadas[0].id };
}

/** Lo que se acredita: lo devuelto, nunca más de lo que queda por anular de la factura. PURA. */
export function importeDeLaNota(devuelto: number, totalFactura: number, yaAcreditado: number): number {
  const saldo = saldoPorAnular(totalFactura, yaAcreditado);
  return Math.min(centavosDe(devuelto), centavosDe(saldo)) / 100;
}

type Tx = Pick<Prisma.TransactionClient, "auditLog">;

/** Anota la nota pendiente, en la tx del ajuste (la misma que escribe el EGRESO). */
export async function anotarNotaPorPesoInTx(
  tx: Tx,
  tenantId: string,
  d: { orderId: string; egresoId: string; facturaId: string; importe: number; code: number; actor: string },
): Promise<NotaPorPeso> {
  const clave = claveNotaPorPeso(d.orderId, d.egresoId);
  await tx.auditLog.create({
    data: {
      tenantId,
      actor: d.actor,
      action: ACCION_NC_PESO_PENDIENTE,
      entity: ENTIDAD_NC_POR_PESO,
      entityId: clave,
      channel: "admin",
      changes: { orderId: d.orderId, egresoId: d.egresoId, facturaId: d.facturaId, importe: d.importe, code: d.code },
    },
  });
  return { estado: "pendiente", clave, importe: d.importe };
}

const fmt = fmtMoneyARS;

/** La frase de la nota para el aviso de «listo». PURA. */
export function fraseDeLaNota(n: NotaPorPeso | null | undefined): string {
  if (!n) return "";
  switch (n.estado) {
    case "sin-factura":
      return " La venta no tenía factura: no hace falta nota de crédito.";
    case "emitida":
      return ` Se emitió la nota de crédito por ${fmt(n.importe)} (de prueba: ARCA simulado, sin validez fiscal).`;
    case "pendiente":
      return ` La nota de crédito por ${fmt(n.importe)} (de prueba) quedó pendiente: se vuelve a intentar sola.`;
    case "rechazada":
      return ` La nota de crédito por ${fmt(n.importe)} no se pudo emitir: ${n.motivo} Revisalo en Facturación.`;
  }
}
