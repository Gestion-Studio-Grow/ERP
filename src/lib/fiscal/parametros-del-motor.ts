/**
 * Motor de facturación · PARÁMETROS FISCALES (PR3). PURO.
 *
 * Los números que el motor usa cuando emite sin que nadie mire, en un solo lugar y con su estado.
 * Todos están marcados «provisional a confirmar» con el contador hasta que el dueño los firme.
 *
 * 1. Ventana de fechas (CbteFch): cuántos días antes o después del día del envío acepta ARCA la
 *    fecha del comprobante. Manual de WSFEv1: 5 días para productos (concepto 1) y 10 para
 *    servicios (2 y 3). El brief de PR3 pide ±5 días; es lo que ya rige para productos.
 *
 * 2. Umbral de identificación del consumidor final del MOTOR. Va ENCIMA del umbral legal (tabla de
 *    vigencias, RG 5700/2025, hoy $10.000.000): si el del motor es menor, manda el del motor y una
 *    venta a consumidor final sin documento desde ese importe queda PENDIENTE_DATOS (pide el DNI o
 *    el CUIT). Se separa por medio de pago: efectivo y otros medios.
 *
 *    DECISIÓN ANOTADA (06/11/2026): el brief propone $417.288 en efectivo y $208.644 en otros
 *    medios. Esos son los montos que regían ANTES de la RG 5700/2025 (ver vigencias.ts). Activarlos
 *    por defecto frenaría ventas de Mercado Pago de más de $208.644 que la ley ya no obliga a
 *    identificar. Quedan cargados como PROPUESTA (`UMBRAL_PROPUESTO_PR3`) y el motor arranca con el
 *    umbral legal solo (`null`). Para activarlos alcanza con poner la propuesta en
 *    `PARAMETROS_DEL_MOTOR.umbralConsumidorFinal`. A confirmar con el contador.
 */

export type MedioDePago = "efectivo" | "otro";

export interface UmbralPorMedio {
  /** En pesos. `null`: sin regla propia del motor (sólo la legal). */
  efectivo: number | null;
  otro: number | null;
}

export interface ParametrosDelMotor {
  /** Días de ventana por concepto de ARCA (1 productos, 2 servicios, 3 ambos). Provisional a confirmar. */
  ventanaDias: Readonly<Record<1 | 2 | 3, number>>;
  /** Umbral propio del motor para identificar al consumidor final. Provisional a confirmar. */
  umbralConsumidorFinal: Readonly<UmbralPorMedio>;
}

/** Propuesta del brief de PR3 (montos previos a la RG 5700/2025). Provisional a confirmar; NO activa. */
export const UMBRAL_PROPUESTO_PR3: Readonly<UmbralPorMedio> = Object.freeze({ efectivo: 417_288, otro: 208_644 });

export const PARAMETROS_DEL_MOTOR: Readonly<ParametrosDelMotor> = Object.freeze({
  ventanaDias: Object.freeze({ 1: 5, 2: 10, 3: 10 }),
  umbralConsumidorFinal: Object.freeze({ efectivo: null, otro: null }),
});

/**
 * El umbral del motor para un medio de pago. Sin medio conocido se toma el MÁS BAJO de los dos
 * (lo más exigente: pedir el documento de más es corregible; facturar sin él cuando hacía falta, no).
 */
export function umbralDelMotor(medio: MedioDePago | null | undefined, umbral: UmbralPorMedio = PARAMETROS_DEL_MOTOR.umbralConsumidorFinal): number | null {
  if (medio === "efectivo") return umbral.efectivo;
  if (medio === "otro") return umbral.otro;
  const valores = [umbral.efectivo, umbral.otro].filter((v): v is number => typeof v === "number" && v > 0);
  return valores.length ? Math.min(...valores) : null;
}
