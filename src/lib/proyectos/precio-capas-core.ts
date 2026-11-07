// PROYECTOS · PRECIO POR CAPAS (MIA T1) — reglas puras, sin base ni React.
//
// La planilla de MIA arma la venta por capas: costo → + rentabilidad → + comisión del productor y del comercial (un % DE
// esa rentabilidad cada uno) → + margen de error → + impuestos y gastos SOBRE LA VENTA → precio sugerido. El precio
// final se escribe a mano y la diferencia es el «redondeo», con un tope (±5 %). Al cierre, lo ahorrado contra el
// presupuesto (la «defensa») se reparte entre la empresa y el productor.
//
// Toda la cuenta va en CENTAVOS ENTEROS y los porcentajes en PUNTOS BÁSICOS (3000 = 30 %): ningún flotante decide un
// centavo. Cada porción se redondea al centavo «mitad hacia arriba» (en valor absoluto) con BigInt, sin desbordes.
// Los repartos cuadran por construcción: la segunda parte es el total menos la primera.

import { centavosDe } from "@/lib/dinero/redondeo";

export const BP_100 = 10_000;

/** El mensaje cuando el código llegó antes que la migración `20261107120000_proyecto_precio_capas`. */
export const SIN_MIGRACION_PRECIO = "La fórmula de precio todavía no está habilitada en este negocio: falta actualizar la base. Avisale a Dirección.";

export interface ParametrosPrecio {
  rentabilidadBp: number;
  /** Sobre la rentabilidad. */
  comisionProductorBp: number;
  /** Sobre la rentabilidad. */
  comisionComercialBp: number;
  /** Sobre costo + rentabilidad + comisiones. */
  margenErrorBp: number;
  /** Sobre la venta: el precio sugerido se agranda para que este % del precio cubra Ingresos Brutos y gastos. */
  impuestosBp: number;
  /** Cuánto puede apartarse el precio final del sugerido, para arriba o para abajo. */
  topeRedondeoBp: number;
  /** La parte del ahorro contra el presupuesto que queda en la empresa; el resto es del productor. */
  ahorroEmpresaBp: number;
}

/** Los de la planilla de MIA (07/11/2026). PROVISIONAL A CONFIRMAR con Mariana. */
export const PARAMETROS_MIA: Readonly<ParametrosPrecio> = Object.freeze({
  rentabilidadBp: 3000,
  comisionProductorBp: 1000,
  comisionComercialBp: 1000,
  margenErrorBp: 500,
  impuestosBp: 700,
  topeRedondeoBp: 500,
  ahorroEmpresaBp: 7500,
});

/** Topes de cada parámetro, en puntos básicos. Los mismos que el CHECK de la migración. */
export const LIMITES_BP: Readonly<Record<keyof ParametrosPrecio, number>> = Object.freeze({
  rentabilidadBp: 100_000,
  comisionProductorBp: BP_100,
  comisionComercialBp: BP_100,
  margenErrorBp: BP_100,
  impuestosBp: 5_000, // más de la mitad del precio en impuestos no es un precio: la división se dispara
  topeRedondeoBp: 5_000,
  ahorroEmpresaBp: BP_100,
});

export const ETIQUETA_PARAMETRO: Readonly<Record<keyof ParametrosPrecio, string>> = Object.freeze({
  rentabilidadBp: "Rentabilidad",
  comisionProductorBp: "Comisión del productor (sobre la rentabilidad)",
  comisionComercialBp: "Comisión del comercial (sobre la rentabilidad)",
  margenErrorBp: "Margen de error",
  impuestosBp: "Ingresos Brutos y gastos (sobre la venta)",
  topeRedondeoBp: "Tope del redondeo",
  ahorroEmpresaBp: "Ahorro que queda en la empresa",
});

export const CLAVES_PARAMETRO = Object.keys(PARAMETROS_MIA) as (keyof ParametrosPrecio)[];

const esEnteroSeguro = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n);

/** El motivo por el que unos parámetros no sirven, o null si sirven. */
export function problemaDeParametros(p: ParametrosPrecio): string | null {
  for (const k of CLAVES_PARAMETRO) {
    const v = p[k];
    if (!esEnteroSeguro(v) || v < 0 || v > LIMITES_BP[k]) return `${ETIQUETA_PARAMETRO[k]}: tiene que ser un porcentaje entre 0 y ${LIMITES_BP[k] / 100}.`;
  }
  return null;
}

/** "30", "30,5", "7.25", "30 %" → puntos básicos. Null si no es un porcentaje con hasta dos decimales. */
export function bpDeTexto(texto: string): number | null {
  const s = texto.trim().replace(/\s*%$/, "").replace(",", ".");
  const m = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** 3000 → "30", 725 → "7,25". */
export const textoDeBp = (bp: number): string => (bp / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 });

// ── Aritmética entera ───────────────────────────────────────────────────────

/** a·b/c redondeado al entero, mitad hacia arriba en valor absoluto. c > 0. BigInt: no desborda con montos grandes. */
export function proporcion(a: number, b: number, c: number): number {
  if (!esEnteroSeguro(a) || !esEnteroSeguro(b) || !esEnteroSeguro(c) || c <= 0) throw new RangeError("proporcion: enteros seguros y divisor positivo");
  const num = BigInt(a) * BigInt(b);
  const neg = num < BigInt(0);
  const abs = neg ? -num : num;
  const den = BigInt(c);
  const q = (abs * BigInt(2) + den) / (den * BigInt(2)); // floor(abs/den + 1/2)
  const r = Number(q);
  return neg && r !== 0 ? -r : r;
}

/** El `bp` de un monto en centavos. */
export const porcionBp = (centavos: number, bp: number): number => proporcion(centavos, bp, BP_100);

/** Pesos (como los guarda el resto del módulo, Float) → centavos enteros, con el redondeo de la casa (1,005 → 101). */
export function centavosDePesos(pesos: number): number {
  if (!Number.isFinite(pesos)) throw new RangeError("centavosDePesos: monto inválido");
  return centavosDe(pesos);
}

export const pesosDeCentavos = (c: number): number => c / 100;

// ── El precio ───────────────────────────────────────────────────────────────

export interface DesglosePrecio {
  costo: number;
  rentabilidad: number;
  comisionProductor: number;
  comisionComercial: number;
  /** costo + rentabilidad + comisiones. */
  subtotal: number;
  margenError: number;
  /** Lo que tiene que quedar después de pagar impuestos y gastos. */
  antesDeImpuestos: number;
  impuestos: number;
  sugerido: number;
}

/** El desglose capa por capa, todo en centavos. El costo no puede ser negativo. */
export function desglosePrecio(costoCent: number, p: ParametrosPrecio): DesglosePrecio {
  const problema = problemaDeParametros(p);
  if (problema) throw new RangeError(problema);
  if (!esEnteroSeguro(costoCent) || costoCent < 0) throw new RangeError("El costo tiene que ser un monto en centavos, no negativo.");
  const rentabilidad = porcionBp(costoCent, p.rentabilidadBp);
  const comisionProductor = porcionBp(rentabilidad, p.comisionProductorBp);
  const comisionComercial = porcionBp(rentabilidad, p.comisionComercialBp);
  const subtotal = costoCent + rentabilidad + comisionProductor + comisionComercial;
  const margenError = porcionBp(subtotal, p.margenErrorBp);
  const antesDeImpuestos = subtotal + margenError;
  // Sobre la venta: sugerido · (1 − imp) = antesDeImpuestos  →  sugerido = antesDeImpuestos / (1 − imp).
  const sugerido = proporcion(antesDeImpuestos, BP_100, BP_100 - p.impuestosBp);
  return { costo: costoCent, rentabilidad, comisionProductor, comisionComercial, subtotal, margenError, antesDeImpuestos, impuestos: sugerido - antesDeImpuestos, sugerido };
}

export interface PrecioFinal {
  /** El que se cobra: el escrito a mano o, sin él, el sugerido. */
  final: number;
  manual: boolean;
  /** final − sugerido. */
  redondeo: number;
  /** El redondeo como % del sugerido, en puntos básicos (con signo). */
  redondeoBp: number;
  dentroDelTope: boolean;
}

/** ¿El precio escrito a mano está dentro del tope? Comparación exacta en enteros: |final − sugerido| · 10000 ≤ sugerido · tope. */
export function dentroDelTope(sugeridoCent: number, finalCent: number, topeBp: number): boolean {
  const dif = BigInt(Math.abs(finalCent - sugeridoCent));
  return dif * BigInt(BP_100) <= BigInt(sugeridoCent) * BigInt(topeBp);
}

export function precioFinal(sugeridoCent: number, manualCent: number | null, topeBp: number): PrecioFinal {
  const manual = manualCent !== null && manualCent > 0;
  const final = manual ? manualCent : sugeridoCent;
  const redondeo = final - sugeridoCent;
  return {
    final,
    manual,
    redondeo,
    redondeoBp: sugeridoCent > 0 ? proporcion(redondeo, BP_100, sugeridoCent) : 0,
    dentroDelTope: sugeridoCent > 0 ? dentroDelTope(sugeridoCent, final, topeBp) : !manual,
  };
}

/** El rango que admite el tope, en centavos, cerrado: [mínimo, máximo]. */
export function rangoDelTope(sugeridoCent: number, topeBp: number): { minimo: number; maximo: number } {
  // Lo más que se puede mover sin pasarse: floor(sugerido · tope / 10000).
  const margen = Number((BigInt(sugeridoCent) * BigInt(topeBp)) / BigInt(BP_100));
  return { minimo: sugeridoCent - margen, maximo: sugeridoCent + margen };
}

// ── Comisiones y reparto del ahorro ─────────────────────────────────────────

export interface RepartoAhorro {
  /** presupuesto − real: positivo es lo ahorrado; negativo, lo que se gastó de más. Null sin datos para medirlo. */
  ahorro: number | null;
  empresa: number;
  productor: number;
}

/** Lo ahorrado contra el costo presupuestado se reparte; si se gastó de más, no hay nada que repartir (no se descuenta). */
export function repartoDelAhorro(presupuestoCent: number | null, realCent: number | null, ahorroEmpresaBp: number): RepartoAhorro {
  if (presupuestoCent === null || realCent === null) return { ahorro: null, empresa: 0, productor: 0 };
  const ahorro = presupuestoCent - realCent;
  if (ahorro <= 0) return { ahorro, empresa: 0, productor: 0 };
  const empresa = porcionBp(ahorro, ahorroEmpresaBp);
  return { ahorro, empresa, productor: ahorro - empresa };
}

export interface ComisionDePersona {
  rol: "productor" | "comercial";
  personaId: string | null;
  comision: number;
  /** Su parte del ahorro (sólo el productor). */
  ahorro: number;
  total: number;
}

export function comisionesDelProyecto(
  d: Pick<DesglosePrecio, "comisionProductor" | "comisionComercial">,
  reparto: RepartoAhorro,
  personas: { productorId: string | null; comercialId: string | null },
): ComisionDePersona[] {
  return [
    { rol: "productor", personaId: personas.productorId, comision: d.comisionProductor, ahorro: reparto.productor, total: d.comisionProductor + reparto.productor },
    { rol: "comercial", personaId: personas.comercialId, comision: d.comisionComercial, ahorro: 0, total: d.comisionComercial },
  ];
}

// ── Lectura de la configuración guardada ────────────────────────────────────

export interface ConfigPrecioGuardada extends ParametrosPrecio {
  activa: boolean;
}

/** La fila de la base → parámetros, o null si el negocio no usa la fórmula (sin fila, apagada o con datos imposibles). */
export function formulaVigente(fila: ConfigPrecioGuardada | null | undefined): ParametrosPrecio | null {
  if (!fila || !fila.activa) return null;
  const p: ParametrosPrecio = {
    rentabilidadBp: fila.rentabilidadBp,
    comisionProductorBp: fila.comisionProductorBp,
    comisionComercialBp: fila.comisionComercialBp,
    margenErrorBp: fila.margenErrorBp,
    impuestosBp: fila.impuestosBp,
    topeRedondeoBp: fila.topeRedondeoBp,
    ahorroEmpresaBp: fila.ahorroEmpresaBp,
  };
  return problemaDeParametros(p) ? null : p;
}

/** "1.234.567,89" / "1234567.89" / "$ 1.500" → centavos. Null si no se entiende o tiene más de dos decimales. */
export function centavosDeTexto(texto: string): number | null {
  let s = texto.trim().replace(/^\$\s*/, "").replace(/\s/g, "");
  if (!s) return null;
  // Formato argentino: puntos de miles y coma decimal. Un único punto seguido de 1 o 2 cifras es decimal.
  if (/^\d+\.\d{1,2}$/.test(s)) s = s.replace(".", ",");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  const [ent, dec = ""] = s.replace(/\./g, "").split(",");
  const n = Number(ent) * 100 + Number(dec.padEnd(2, "0"));
  return Number.isSafeInteger(n) ? n : null;
}
