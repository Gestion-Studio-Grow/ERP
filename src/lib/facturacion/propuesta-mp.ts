// ============================================================================
// Propuestas de Mercado Pago ↔ contrato de estados v1.1. PURO.
// ============================================================================
//
// Un pago de MP que se puede facturar queda como propuesta en `MovimientoImportado` (la bandeja
// compartida con los bancos), con hash = la clave de origen del pago. Dos reglas:
//
//  · HASH: la forma GUARDADA de la clave (`claveAlmacenada`, hoy `mp:<id>`), la misma que ya escribe
//    la ingesta automática (`hashPagoMP`) y que usa el libro `CobroFacturado`. Su nombre canónico es
//    `mp:payment:<id>` y se lee igual (`leerClaveOrigen`). Escribir la forma canónica abriría DOS filas
//    para el mismo pago (el índice único es tenantId + hash): no se hace.
//  · ESTADO: antes de «emitida» manda el estado propio de la propuesta (auto / revision /
//    no_facturable / descartado). Desde «emitida» manda el contrato v1.1 (`estadoDelComprobante`,
//    con el tope por defecto de la política de reintentos: no se pasa ninguno a mano).

import type { PagoMP } from "@/plugins/mercadopago";
import type { DecisionPagoMP } from "@/lib/mercadopago-clasificacion";
import { claveAlmacenada, leerClaveOrigen } from "@/lib/facturacion/clave-origen";
import { estadoDelComprobante, type EstadoComprobante, type HechosDelComprobante } from "@/lib/facturacion/estado-comprobante";

export type EstadoPropuestaMP = "auto" | "revision" | "no_facturable" | "descartado" | "emitida";

/** El hash de la propuesta de un pago de MP (forma guardada de `mp:payment:<id>`). */
export function hashPropuestaMP(paymentId: string): string {
  return claveAlmacenada({ tipo: "mp_payment", id: paymentId });
}

/** El id del pago a partir del hash de una propuesta (cualquiera de las dos formas); null si no es de MP. */
export function pagoDeLaPropuesta(hash: string): string | null {
  const o = leerClaveOrigen(hash);
  return o?.tipo === "mp_payment" ? o.id : null;
}

/** Lo que se guarda de una propuesta nueva (sin importación: la pone quien escribe). */
export interface PropuestaMPArmada {
  hash: string;
  fecha: string;
  monto: number;
  descripcion: string;
  contraparte: string | null;
  referencia: string;
  estadoPropuesta: EstadoPropuestaMP;
  requiereIdentificacion: boolean;
  motivoRevision: string | null;
  invoiceId: string | null;
}

function hoyAAAAMMDD(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(ahora)
    .replace(/-/g, "");
}

/**
 * Cómo queda la propuesta según la clasificación del pago. `null` = no se guarda nada (facturación de
 * MP apagada). Las exclusiones quedan como rastro «no_facturable» para que el respaldo no las vuelva a
 * mirar; «emitir» queda «auto»: la emisión la hace el motor, no el que arma la propuesta.
 */
export function armarPropuestaMP(pago: PagoMP, decision: DecisionPagoMP, ahora: Date): PropuestaMPArmada | null {
  if (decision.tipo === "nada") return null;
  const base = {
    hash: hashPropuestaMP(pago.id),
    fecha: pago.fechaAcreditacion ?? hoyAAAAMMDD(ahora),
    monto: pago.monto,
    descripcion: pago.descripcion?.trim() || `Cobro Mercado Pago ${pago.id}`,
    contraparte: pago.contraparteNombre ?? null,
    referencia: pago.id,
    requiereIdentificacion: false,
    motivoRevision: null as string | null,
    invoiceId: null as string | null,
  };
  switch (decision.tipo) {
    case "excluir":
      return { ...base, estadoPropuesta: "no_facturable", motivoRevision: `No es una venta (${decision.motivo})` };
    case "enlazar":
      return { ...base, estadoPropuesta: "emitida", invoiceId: decision.invoiceId };
    case "pendiente_datos":
      return { ...base, monto: decision.importe, estadoPropuesta: "revision", requiereIdentificacion: true, motivoRevision: "Supera el umbral: falta el documento del comprador" };
    case "proponer":
    case "emitir":
      return { ...base, monto: decision.importe, estadoPropuesta: "auto" };
  }
}

/** Lo que la bandeja muestra de una propuesta: su estado propio o, desde «emitida», el del comprobante. */
export type EstadoEnBandeja =
  | { de: "propuesta"; estado: Exclude<EstadoPropuestaMP, "emitida"> }
  | { de: "comprobante"; estado: EstadoComprobante; motivo: string | null; reintentaEn: string | null; final: boolean };

/**
 * `hechos` = Invoice + su envío del outbox. Una propuesta «emitida» cuya factura no aparece (rastro
 * débil, sin FK) se muestra EN_COLA: nunca se inventa un AUTORIZADO.
 */
export function estadoEnBandeja(estadoPropuesta: EstadoPropuestaMP, hechos: HechosDelComprobante | null, ahora: Date): EstadoEnBandeja {
  if (estadoPropuesta !== "emitida") return { de: "propuesta", estado: estadoPropuesta };
  if (!hechos) return { de: "comprobante", estado: "EN_COLA", motivo: null, reintentaEn: null, final: false };
  const v = estadoDelComprobante(hechos, ahora);
  return { de: "comprobante", estado: v.estado, motivo: v.motivo, reintentaEn: v.reintentaEn ? v.reintentaEn.toISOString() : null, final: v.final };
}

/** Rótulo corto para la bandeja. */
export const ROTULO_ESTADO: Record<EstadoComprobante, string> = {
  EN_COLA: "En cola",
  EMITIENDO: "Emitiendo",
  FALLA_TRANSITORIA: "Reintentando",
  PENDIENTE_DATOS: "Faltan datos",
  PENDIENTE_REVISION: "Para revisar",
  AUTORIZADO: "Autorizada",
  RECHAZADO: "Rechazada por ARCA",
};
