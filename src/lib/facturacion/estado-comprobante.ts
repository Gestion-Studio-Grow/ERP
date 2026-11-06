// ============================================================================
// CONTRATO DE ESTADOS DEL COMPROBANTE — congelado (v1.1, 06/11/2026). PURO.
// v1.1 (autorizada por la orquestadora): el tope de intentos por defecto sale de la política de
// reintentos (fuente única, arca-reintentos.ts: 4 intentos y 24 h), ya no un 8 fijo.
// ============================================================================
//
// Lo que cualquier pantalla o integración (emisión manual, facturación de cobros de Mercado Pago,
// la consola del contador) necesita saber de UN comprobante, en siete estados explícitos. Se DERIVA
// de lo que ya guarda el motor —`Invoice.status` + `rechazoMotivo` y su envío en el outbox
// (`OutboxEvent`: processedAt, attempts, proximoIntentoEn, bloqueadoHasta, muertoEn)— así que NO
// necesita migración. Si algún día se persiste como columna, esta función es la que la llena.
//
//   EN_COLA            pendiente, esperando su turno (todavía no se intentó o le toca ya).
//   EMITIENDO          un despacho lo tomó y está hablando con ARCA ahora (lock vigente).
//   FALLA_TRANSITORIA  falló por algo que no es del comprobante (ARCA caída, token, 10016, red);
//                      se reintenta solo en `reintentaEn`. Antes de pedir otro CAE el motor
//                      consulta el número anotado y adopta el que ARCA ya haya dado (ENG-020).
//   PENDIENTE_DATOS    no sale hasta que alguien cargue un dato: lo frenó la validación propia
//                      (rechazo «del sistema») o falta configuración fiscal del negocio
//                      (CUIT, certificado, delegación: envío detenido de entrada).
//   PENDIENTE_REVISION se agotaron los reintentos automáticos: lo tiene que mirar una persona
//                      («Reintentar» lo reactiva). Sigue sin CAE: no se sabe si ARCA lo autoriza.
//   AUTORIZADO         tiene CAE. Nunca se borra ni se edita: se anula con nota de crédito.
//   RECHAZADO          ARCA evaluó el comprobante y dijo que no (código de ARCA). No se
//                      reintenta: se corrige el dato y se emite uno nuevo.
//
// Reglas del contrato (no cambian sin versión nueva):
//   · Un AUTORIZADO no vuelve a ningún otro estado.
//   · RECHAZADO y PENDIENTE_DATOS por validación no se reintentan solos; la idempotencia de un
//     origen (claveOrigen, p. ej. `mp:payment:<id>` o `manual:<uuid>`) permite volver a facturar
//     ESE origen con un comprobante nuevo después de un rechazo, nunca dos autorizados.
//   · `reintentaEn` sólo viene en FALLA_TRANSITORIA (y en EN_COLA cuando está esperando su hora).

import { origenDelRechazo, motivoLegible as sinRotulos } from "@/lib/facturita-core";
import { POLITICA_DE_REINTENTOS } from "@/lib/arca-reintentos";

/** El motivo sin rótulos técnicos ni el código de ARCA adelante («10015: …» → «…»). */
function motivoLegible(m: string | null): string {
  return sinRotulos((m ?? "").replace(/^\s*\d+\s*:\s*/, ""));
}

export const VERSION_CONTRATO_ESTADOS = 1.1 as const;

export type EstadoComprobante =
  | "EN_COLA"
  | "EMITIENDO"
  | "FALLA_TRANSITORIA"
  | "PENDIENTE_DATOS"
  | "PENDIENTE_REVISION"
  | "AUTORIZADO"
  | "RECHAZADO";

/** Lo que el motor guarda hoy de un comprobante y de su envío a ARCA. */
export interface HechosDelComprobante {
  status: "PENDING" | "AUTHORIZED" | "REJECTED";
  rechazoMotivo: string | null;
  cae: string | null;
  /** El envío del outbox (`InvoiceCreated`); `null` si no hay (facturación apagada al crearlo). */
  envio: {
    processedAt: Date | null;
    attempts: number;
    lastError: string | null;
    proximoIntentoEn: Date | null;
    bloqueadoHasta: Date | null;
    muertoEn: Date | null;
  } | null;
}

export interface VistaDelEstado {
  estado: EstadoComprobante;
  /** Para mostrar, en criollo y sin rótulos técnicos. `null` cuando no hay nada que explicar. */
  motivo: string | null;
  /** Próximo intento automático (sólo FALLA_TRANSITORIA / EN_COLA esperando su hora). */
  reintentaEn: Date | null;
  /** ¿Se terminó (no cambia más solo)? AUTORIZADO, RECHAZADO; los demás pueden avanzar. */
  final: boolean;
}

/** Intentos con los que el motor se rinde (POLITICA_DE_REINTENTOS.maxIntentos, arca-reintentos.ts). */
export function estadoDelComprobante(h: HechosDelComprobante, ahora: Date, maxIntentos = POLITICA_DE_REINTENTOS.maxIntentos): VistaDelEstado {
  if (h.status === "AUTHORIZED") return { estado: "AUTORIZADO", motivo: null, reintentaEn: null, final: true };
  if (h.status === "REJECTED") {
    const motivo = motivoLegible(h.rechazoMotivo);
    return origenDelRechazo(h.rechazoMotivo) === "arca"
      ? { estado: "RECHAZADO", motivo, reintentaEn: null, final: true }
      : { estado: "PENDIENTE_DATOS", motivo, reintentaEn: null, final: false };
  }
  const e = h.envio;
  if (!e) return { estado: "EN_COLA", motivo: null, reintentaEn: null, final: false };
  const error = e.lastError ? motivoLegible(e.lastError) : null;
  if (e.muertoEn) {
    // Detenido ANTES del tope = configuración fiscal faltante (arca-reintentos: «configuracion»).
    return e.attempts >= maxIntentos
      ? { estado: "PENDIENTE_REVISION", motivo: error, reintentaEn: null, final: false }
      : { estado: "PENDIENTE_DATOS", motivo: error, reintentaEn: null, final: false };
  }
  if (e.bloqueadoHasta && e.bloqueadoHasta > ahora) return { estado: "EMITIENDO", motivo: null, reintentaEn: null, final: false };
  const espera = e.proximoIntentoEn && e.proximoIntentoEn > ahora ? e.proximoIntentoEn : null;
  if (e.attempts > 0) return { estado: "FALLA_TRANSITORIA", motivo: error, reintentaEn: espera ?? ahora, final: false };
  return { estado: "EN_COLA", motivo: null, reintentaEn: espera, final: false };
}
