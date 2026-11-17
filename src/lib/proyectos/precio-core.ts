/**
 * Motor de precio «por total» (GSG-MIA-056 · T04). Replica el «TABLERO PPAL» de la planilla de origen, descrito en
 * Factory-GSG 00-ESTADO/MIA-PROYECTOS-ADMINISTRACION-DISENO-2026-11-16.md § 1.4.
 *
 * PURA: no lee la base, ni el reloj, ni el azar. Los porcentajes llegan como argumento: los fija quien llama, que
 * hoy es la vista previa y, desde T03 y T07, el catálogo de parámetros del negocio y la foto de la aprobación.
 *
 * Plata en centavos enteros (Dis. § 2.6: «montos en centavos enteros, nunca en Float»; el ERP ya los usa en
 * `ProyectoRendicion.montoCentavos`, prisma/schema.prisma:4147). La cuenta va en enteros (BigInt) y cada renglón se
 * redondea UNA vez con la regla R1 del ERP: medio centavo hacia arriba, lejos del cero (src/lib/dinero/redondeo.ts:4).
 * Los porcentajes llevan hasta dos decimales y se cuentan en puntos básicos: 7,5 % = 750.
 *
 * Renglones (celdas de la planilla, Dis. § 1.4):
 *   R  = (CO + AD) × % rentabilidad                         G15
 *   comisión de cada función = R × su %                     G12:G14 (porcentaje de la rentabilidad, no de la venta)
 *   ME = (CO + R) × % margen de error                       G16 (no incluye adicionales)
 *   subtotal = CO + AD + R + comisiones + ME                G18 (no suma IIB y GA)
 *   IIB y GA = subtotal × p ÷ (100 − p)                     G17
 *   redondeo bruto = total − subtotal                       G21; en % del total, G22
 *   redondeo neto = bruto − IIB y GA                        (Dis. § 1.4: el bruto contiene IIB y GA)
 */

import { centavosDe } from "../dinero/redondeo";

export type Centavos = number;

/** Porcentajes del tablero, en puntos (30 = 30 %), con hasta dos decimales. */
export interface PorcentajesPrecio {
  productor1: number;
  productor2: number;
  comercial: number;
  rentabilidad: number;
  margenError: number;
  iibGa: number;
}

/** El tope del redondeo: el porcentaje y contra qué redondeo se mide. En el Excel, el bruto contra el total. */
export interface TopeRedondeo {
  pct: number;
  medidoSobre: "bruto" | "neto";
}

export interface EntradaPrecio {
  costoOriginal: Centavos;
  adicionales: Centavos;
  porcentajes: PorcentajesPrecio;
  /** Escrito a mano («PONER A MANO», H19). Null mientras no se escribió. */
  totalVenta: Centavos | null;
  tope: TopeRedondeo;
}

export interface Precio {
  costoOriginal: Centavos;
  adicionales: Centavos;
  rentabilidad: Centavos;
  comisiones: { productor1: Centavos; productor2: Centavos; comercial: Centavos };
  margenError: Centavos;
  subtotal: Centavos;
  iibGa: Centavos;
  totalVenta: Centavos | null;
  redondeoBruto: Centavos | null;
  redondeoNeto: Centavos | null;
  /** El redondeo bruto en puntos básicos del total, redondeado al punto básico (436 = 4,36 %). Null sin total o con total 0. */
  redondeoPuntos: number | null;
  /** El Excel lo rechaza. Acá se marca: qué hacer lo decide la pantalla que guarda (T07). */
  totalMenorAlSubtotal: boolean;
  /** Medido como dice `tope` (entero contra el porcentaje, sin redondear el cociente). Qué hace al pasarlo: decisión 5 (T07). */
  pasaTope: boolean;
}

/**
 * Los valores de la planilla base (DRIVE-INVENTARIO-2026-11-16.md:144). PROVISIONAL A CONFIRMAR con el negocio
 * (preguntas 1, 2 y 21 del Dis. § 1.6). El motor no los usa: son el valor por defecto de quien llama mientras no
 * exista el catálogo de parámetros (T03).
 */
export const PORCENTAJES_PLANTILLA: Readonly<PorcentajesPrecio & { provisional: true }> = Object.freeze({
  productor1: 10,
  productor2: 0,
  comercial: 10,
  rentabilidad: 30,
  margenError: 5,
  iibGa: 7,
  provisional: true,
});

/** 5 %, medido como en el Excel: el redondeo bruto contra el total (Dis. § 4.1 y decisión 5 A). PROVISIONAL. */
export const TOPE_PLANTILLA: Readonly<TopeRedondeo & { provisional: true }> = Object.freeze({ pct: 5, medidoSobre: "bruto", provisional: true });

// Sin literales `10n`: el tsconfig del ERP apunta a menos de ES2020 (TS2737).
const CERO = BigInt(0);
const UNO = BigInt(1);
const DOS = BigInt(2);
const PB_POR_CIENTO = BigInt(10_000);

/** Un porcentaje con hasta dos decimales, en puntos básicos enteros: 7,5 → 750. Rechaza lo que no esté entre 0 y 100. */
export function aPuntosBasicos(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new RangeError(`No es un porcentaje entre 0 y 100: ${String(pct)}.`);
  // El porcentaje × 100 con la regla del ERP (R7 y R1 de src/lib/dinero/redondeo.ts): 1,1 → 110 aunque el binario no sea exacto.
  const pb = centavosDe(pct);
  // Con dos decimales, pct × 100 queda a menos de una millonésima de ese entero; con tres (1,005), a medio punto.
  if (Math.abs(pct * 100 - pb) > 1e-6) throw new RangeError(`El porcentaje lleva hasta dos decimales: ${String(pct)}.`);
  return pb;
}

function exigirCentavos(nombre: string, c: number): void {
  if (!Number.isSafeInteger(c) || c < 0) throw new RangeError(`${nombre}: tiene que ser un importe en centavos enteros, cero o más (llegó ${String(c)}).`);
}

/** numerador ÷ denominador, redondeado por R1 (medio hacia arriba, lejos del cero), en enteros. Denominador > 0. */
function dividirR1(numerador: bigint, denominador: bigint): bigint {
  const negativo = numerador < CERO;
  const abs = negativo ? -numerador : numerador;
  const cociente = abs / denominador;
  const resto = abs % denominador;
  const redondeado = DOS * resto >= denominador ? cociente + UNO : cociente;
  return negativo ? -redondeado : redondeado;
}

function aNumero(b: bigint): number {
  const n = Number(b);
  if (!Number.isSafeInteger(n)) throw new RangeError(`El importe no entra en centavos enteros: ${b.toString()}.`);
  return n === 0 ? 0 : n; // nunca −0
}

/** `centavos` × `pb` puntos básicos, redondeado una vez por R1. Ej.: 12.345 × 10 % = 1.234,5 → 1.235. */
export function multiplicarPorPuntos(centavos: Centavos, pb: number): Centavos {
  if (!Number.isSafeInteger(centavos)) throw new RangeError(`No es un importe en centavos enteros: ${String(centavos)}.`);
  if (!Number.isSafeInteger(pb)) throw new RangeError(`No son puntos básicos enteros: ${String(pb)}.`);
  return aNumero(dividirR1(BigInt(centavos) * BigInt(pb), PB_POR_CIENTO));
}

export function calcularPrecio(e: EntradaPrecio): Precio {
  exigirCentavos("Costo original", e.costoOriginal);
  exigirCentavos("Adicionales", e.adicionales);
  if (e.totalVenta !== null) exigirCentavos("Total de venta", e.totalVenta);
  const pb = {
    rentabilidad: aPuntosBasicos(e.porcentajes.rentabilidad),
    productor1: aPuntosBasicos(e.porcentajes.productor1),
    productor2: aPuntosBasicos(e.porcentajes.productor2),
    comercial: aPuntosBasicos(e.porcentajes.comercial),
    margenError: aPuntosBasicos(e.porcentajes.margenError),
    iibGa: aPuntosBasicos(e.porcentajes.iibGa),
    tope: aPuntosBasicos(e.tope.pct),
  };
  if (pb.iibGa >= 10_000) throw new RangeError("IIB y GA tiene que ser menor que 100 %: la cuenta divide por (100 − %).");

  const co = e.costoOriginal;
  const ad = e.adicionales;
  const rentabilidad = multiplicarPorPuntos(co + ad, pb.rentabilidad);
  const comisiones = {
    productor1: multiplicarPorPuntos(rentabilidad, pb.productor1),
    productor2: multiplicarPorPuntos(rentabilidad, pb.productor2),
    comercial: multiplicarPorPuntos(rentabilidad, pb.comercial),
  };
  const margenError = multiplicarPorPuntos(co + rentabilidad, pb.margenError);
  const subtotal = aNumero(BigInt(co) + BigInt(ad) + BigInt(rentabilidad) + BigInt(comisiones.productor1) + BigInt(comisiones.productor2) + BigInt(comisiones.comercial) + BigInt(margenError));
  const iibGa = aNumero(dividirR1(BigInt(subtotal) * BigInt(pb.iibGa), PB_POR_CIENTO - BigInt(pb.iibGa)));

  const total = e.totalVenta;
  const redondeoBruto = total === null ? null : total - subtotal;
  const redondeoNeto = redondeoBruto === null ? null : redondeoBruto - iibGa;
  const redondeoPuntos = total === null || total === 0 || redondeoBruto === null ? null : aNumero(dividirR1(BigInt(redondeoBruto) * PB_POR_CIENTO, BigInt(total)));
  const medido = e.tope.medidoSobre === "neto" ? redondeoNeto : redondeoBruto;
  // Entero contra entero, sin redondear el cociente: pasa si medido ÷ total > tope.
  const pasaTope = total !== null && total > 0 && medido !== null && BigInt(medido) * PB_POR_CIENTO > BigInt(pb.tope) * BigInt(total);

  return {
    costoOriginal: co,
    adicionales: ad,
    rentabilidad,
    comisiones,
    margenError,
    subtotal,
    iibGa,
    totalVenta: total,
    redondeoBruto,
    redondeoNeto,
    redondeoPuntos,
    totalMenorAlSubtotal: total !== null && total < subtotal,
    pasaTope,
  };
}
