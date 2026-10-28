/**
 * Motor de facturación · REINTENTOS de los envíos a ARCA (núcleo PURO).
 *
 * Qué pasa con un envío que no terminó:
 *
 *   · RECHAZO DEFINITIVO (ARCA evaluó el comprobante y dijo que no, o no pasó la validación local):
 *     la factura queda RECHAZADA con el motivo y el envío se cierra. No se reintenta: hay que
 *     corregir el dato y volver a facturar (ENG-021). Lo resuelve `arca-dispatch.ts`.
 *   · PASAJERO (ARCA no contestó, contestó con una falla interna, token, 10016…): el envío queda
 *     pendiente y se reintenta con ESPERA CRECIENTE: 1, 2, 4, 8… minutos, con tope de 60. Antes de
 *     pedir otro CAE, el reintento consulta el número anotado (ENG-020): un comprobante que ARCA
 *     autorizó y cuya respuesta se perdió («en duda») se adopta, nunca se pide uno nuevo.
 *   · DEL SISTEMA (la base rechazó la operación, un error nuestro): igual que pasajero, con la
 *     misma espera: reintentar enseguida no lo arregla.
 *   · CONFIGURACIÓN (falta el CUIT, el certificado no está cargado o es de otro CUIT, la
 *     delegación no está verificada): el envío se DETIENE de entrada. Reintentar no lo arregla:
 *     lo arregla cargar el dato. Queda visible como «detenido» y se reactiva con «Reintentar».
 *   · ARCA NO DISPONIBLE (el interruptor del servicio está abierto): NO cuenta como intento. El
 *     envío se pospone hasta que el interruptor deje probar y el despacho corta la corrida.
 *
 * TOPE: al `maxIntentos`-ésimo intento fallido el envío se DETIENE (`muertoEn`): deja de
 * reintentarse solo y queda a la vista. La factura sigue PENDIENTE (no se rechaza: no se sabe
 * si ARCA la autorizaría). «Reintentar los fallidos» lo reactiva.
 *
 * PURO: sin base, sin reloj (la fecha la pasa quien llama). Lo prueba arca-reintentos.test.ts.
 */

import { ArcaNoDisponibleError, ArcaPasajeroError, ArcaRechazoError, ComprobanteInvalidoError } from "@/plugins/arca";

export interface PoliticaDeReintentos {
  /** Espera antes del primer reintento, en segundos. */
  esperaInicialSeg: number;
  /** Cuánto se multiplica la espera en cada intento. */
  factor: number;
  /** Tope de la espera, en segundos. */
  esperaTopeSeg: number;
  /** Intentos fallidos con los que el envío se detiene. */
  maxIntentos: number;
}

/**
 * La política de hoy. 8 intentos con 1, 2, 4, 8, 16, 32, 60, 60 minutos de espera ≈ 3 h de
 * reintentos automáticos (si el cron o las ventas los disparan; el cron es diario en el plan
 * actual de Vercel, PD-3). Más que eso, el comprobante se acerca al borde de la ventana de fechas
 * que acepta ARCA (5 días productos, 10 servicios) y conviene que lo mire una persona.
 */
export const POLITICA_DE_REINTENTOS: PoliticaDeReintentos = Object.freeze({
  esperaInicialSeg: 60,
  factor: 2,
  esperaTopeSeg: 60 * 60,
  maxIntentos: 8,
});

/** Errores de configuración fiscal del negocio (por nombre: evita cargar node-forge acá). */
const ERRORES_DE_CONFIGURACION = new Set([
  "ConfiguracionFiscalError",
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
 * CONTANDO el que acaba de fallar (1 = falló el primero). Crece `factor` veces por intento, con tope.
 */
export function esperaAntesDelProximo(intentosFallidos: number, politica: PoliticaDeReintentos = POLITICA_DE_REINTENTOS): number {
  const n = Math.max(1, Math.floor(intentosFallidos));
  const espera = politica.esperaInicialSeg * Math.pow(politica.factor, n - 1);
  return Math.min(Math.round(espera), politica.esperaTopeSeg);
}

/** Lo que se anota en el envío después de una falla que se reintenta. */
export interface DespuesDeLaFalla {
  /** Segundos hasta el próximo intento automático; `null` si el envío se detiene. */
  esperaSeg: number | null;
  /** El envío se detiene: no se reintenta solo. */
  detener: boolean;
}

/**
 * Qué hacer con el envío después de una falla que NO es rechazo ni «ARCA no disponible».
 * `intentosPrevios`: los intentos fallidos que ya tenía ANTES de este.
 */
export function despuesDeLaFalla(
  clase: Exclude<ClaseDeFalla, "rechazo" | "arca_no_disponible">,
  intentosPrevios: number,
  politica: PoliticaDeReintentos = POLITICA_DE_REINTENTOS,
): DespuesDeLaFalla {
  if (clase === "configuracion") return { esperaSeg: null, detener: true };
  const intentos = intentosPrevios + 1;
  if (intentos >= politica.maxIntentos) return { esperaSeg: null, detener: true };
  return { esperaSeg: esperaAntesDelProximo(intentos, politica), detener: false };
}
