/**
 * Motor de facturación · REINTENTOS de los envíos a ARCA (núcleo PURO).
 *
 * Qué pasa con un envío que no terminó:
 *
 *   · RECHAZO DEFINITIVO (ARCA evaluó el comprobante y dijo que no, o no pasó la validación local):
 *     la factura queda RECHAZADA con el motivo y el envío se cierra. No se reintenta: hay que
 *     corregir el dato y volver a facturar (ENG-021). Lo resuelve `arca-dispatch.ts`.
 *   · PASAJERO (ARCA no contestó, contestó con una falla interna, token, 10016…): el envío queda
 *     pendiente y se reintenta por una ESCALERA de esperas: 1, 5, 15 y 60 minutos, y después cada
 *     60 minutos fijos. Antes de pedir otro CAE, el reintento consulta el número anotado (ENG-020): un comprobante que ARCA
 *     autorizó y cuya respuesta se perdió («en duda») se adopta, nunca se pide uno nuevo.
 *   · DEL SISTEMA (la base rechazó la operación, un error nuestro): igual que pasajero, con la
 *     misma espera: reintentar enseguida no lo arregla.
 *   · CONFIGURACIÓN (falta el CUIT, el certificado no está cargado o es de otro CUIT, la
 *     delegación no está verificada): el envío se DETIENE de entrada. Reintentar no lo arregla:
 *     lo arregla cargar el dato. Queda visible como «detenido» y se reactiva con «Reintentar».
 *   · ARCA NO DISPONIBLE (el interruptor del servicio está abierto): NO cuenta como intento. El
 *     envío se pospone hasta que el interruptor deje probar y el despacho corta la corrida.
 *
 * TOPE: el envío se DETIENE (`muertoEn`) cuando se cumplen LAS DOS cosas, contando el intento que
 * acaba de fallar: lleva `maxIntentos` intentos o más (4: uno por peldaño) Y pasó la VENTANA de 24 h
 * desde que se creó el envío (`OutboxEvent.createdAt`). Antes de eso sigue en la escalera, aunque
 * lleve 30 intentos (p. ej. con ARCA caída una tarde entera). Ahí deja de reintentarse solo y queda
 * a la vista. La factura sigue PENDIENTE (no se rechaza: no se sabe
 * si ARCA la autorizaría). «Reintentar los fallidos» lo reactiva.
 *
 * La cadencia real la da quien dispara el despacho (programador externo contra el cron, o las
 * ventas): la escalera fija el MÍNIMO entre intentos, no garantiza que se corran a ese ritmo.
 *
 * PURO: sin base, sin reloj (la fecha de creación y el «ahora» los pasa quien llama). Lo prueba arca-reintentos.test.ts.
 */

import { ArcaNoDisponibleError, ArcaPasajeroError, ArcaRechazoError, ComprobanteInvalidoError } from "@/plugins/arca";

export interface PoliticaDeReintentos {
  /** Esperas antes de cada reintento, en segundos (peldaño n = intento fallido n). Pasado el
   *  último peldaño, se repite el último. */
  escaleraSeg: readonly number[];
  /** Intentos fallidos mínimos para detener el envío (además de la ventana). */
  maxIntentos: number;
  /** Ventana de reintentos automáticos desde que se creó el envío, en segundos. */
  ventanaSeg: number;
}

/**
 * La política de hoy: escalera 1, 5, 15, 60 min (después 60 fijo), 4 intentos y ventana de 24 h.
 * Más que eso, el comprobante se acerca al borde de la ventana de fechas que acepta ARCA (5 días
 * productos, 10 servicios) y conviene que lo mire una persona.
 */
export const POLITICA_DE_REINTENTOS: PoliticaDeReintentos = Object.freeze({
  escaleraSeg: Object.freeze([60, 5 * 60, 15 * 60, 60 * 60]),
  maxIntentos: 4,
  ventanaSeg: 24 * 60 * 60,
});

/** Errores de configuración fiscal del negocio (por nombre: evita cargar node-forge acá). */
const ERRORES_DE_CONFIGURACION = new Set([
  "ConfiguracionFiscalError",
  // ENG-123: ARCA simulado en producción con la facturación encendida (fiscal/guarda-simulado.ts).
  "ArcaSimuladoEnProduccionError",
  "CredencialFiscalAusenteError",
  "CuitTenantAusenteError",
  "CredencialCuitMismatchError",
  "PerfilFiscalIncompletoError",
]);

/**
 * Falta un dato fiscal del negocio para hablar con ARCA (CUIT, certificado, delegación). Reintentar
 * no lo arregla: el envío se detiene hasta que alguien cargue el dato.
 */
export class ConfiguracionFiscalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfiguracionFiscalError";
  }
}

export type ClaseDeFalla = "rechazo" | "pasajero" | "arca_no_disponible" | "configuracion" | "sistema";

/** Qué clase de falla es (decide si se rechaza, se reintenta, se pospone o se detiene). */
export function clasificarFalla(err: unknown): ClaseDeFalla {
  if (err instanceof ArcaNoDisponibleError) return "arca_no_disponible";
  if (err instanceof ArcaRechazoError || err instanceof ComprobanteInvalidoError) return "rechazo";
  if (err instanceof ArcaPasajeroError) return "pasajero";
  if (err instanceof Error && ERRORES_DE_CONFIGURACION.has(err.name)) return "configuracion";
  return "sistema";
}

/**
 * Segundos de espera antes del próximo intento, sabiendo cuántos intentos fallidos lleva el envío
 * CONTANDO el que acaba de fallar (1 = falló el primero). Sube por la escalera; pasado el último
 * peldaño, se queda en él.
 */
export function esperaAntesDelProximo(intentosFallidos: number, politica: PoliticaDeReintentos = POLITICA_DE_REINTENTOS): number {
  const escalera = politica.escaleraSeg;
  const n = Math.max(1, Math.floor(intentosFallidos));
  return escalera[Math.min(n, escalera.length) - 1] ?? 0;
}

/** Lo que se anota en el envío después de una falla que se reintenta. */
export interface DespuesDeLaFalla {
  /** Segundos hasta el próximo intento automático; `null` si el envío se detiene. */
  esperaSeg: number | null;
  /** El envío se detiene: no se reintenta solo. */
  detener: boolean;
}

/** Cuándo se creó el envío y qué hora es (el reloj lo pone quien llama). */
export interface MomentoDeLaFalla {
  creadoEn: Date;
  ahora: Date;
}

/**
 * Qué hacer con el envío después de una falla que NO es rechazo ni «ARCA no disponible».
 * `intentosPrevios`: los intentos fallidos que ya tenía ANTES de este. Se detiene cuando, contando
 * este, lleva `maxIntentos` o más Y pasó la ventana desde `creadoEn`; si no, espera el peldaño.
 */
export function despuesDeLaFalla(
  clase: Exclude<ClaseDeFalla, "rechazo" | "arca_no_disponible">,
  intentosPrevios: number,
  momento: MomentoDeLaFalla,
  politica: PoliticaDeReintentos = POLITICA_DE_REINTENTOS,
): DespuesDeLaFalla {
  if (clase === "configuracion") return { esperaSeg: null, detener: true };
  const intentos = intentosPrevios + 1;
  const transcurridoSeg = (momento.ahora.getTime() - momento.creadoEn.getTime()) / 1000;
  if (intentos >= politica.maxIntentos && transcurridoSeg >= politica.ventanaSeg) {
    return { esperaSeg: null, detener: true };
  }
  return { esperaSeg: esperaAntesDelProximo(intentos, politica), detener: false };
}
