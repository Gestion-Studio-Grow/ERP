// Aritmética PURA del LIBRO DE CAJA mensual multi-medio.
//
// Reemplaza la planilla de Google Sheets con la que CH Estética lleva la caja hoy:
// una fila por movimiento (fecha · detalle · ingreso/egreso por medio) con SALDO
// corrido, más un bloque RESUMEN arriba que abre por medio de pago.
//
// Vive fuera de las server actions a propósito, igual que cash-register.ts: acá está
// SOLO el cálculo —sin Prisma, sin sesión, sin tenant—, así el libro es unit-testeable
// de punta a punta (ver libro-caja.test.ts). La persistencia vive en
// src/lib/libro-caja-actions.ts y NUNCA duplica esta aritmética.
//
// Relación con el arqueo de turno (cash-register.ts): son dos lecturas del MISMO
// ledger, no dos verdades. El arqueo mira UN turno y SOLO el efectivo (es contar el
// cajón). El libro mira UN MES completo y los TRES medios (es la caja del negocio).
// El signo de cada movimiento lo decide una sola función, `movementSign`, importada
// de cash-register.ts — no se reimplementa acá.

import { round2 } from "@/lib/round";
import { movementSign, type CashMethod, type CashMovementType } from "@/lib/caja/cash-register";

// Orden CANÓNICO de los medios: es el orden de las columnas de la planilla y el de
// las columnas de la pantalla. Un solo lugar para que tabla y resumen no se
// desincronicen.
export const CASH_METHODS = ["EFECTIVO", "MP", "TARJETA"] as const;

export const CASH_METHOD_LABEL: Record<CashMethod, string> = {
  EFECTIVO: "Efectivo",
  MP: "MP / Transf.",
  TARJETA: "Tarjeta",
};

// Plata desglosada por medio + total. El total NO se guarda aparte: siempre se deriva
// de los tres medios (`totalOf`), así no puede quedar desfasado del desglose.
export type MethodAmounts = Record<CashMethod, number>;

export type LibroMovement = {
  id: string;
  occurredAt: Date;
  type: CashMovementType;
  method: CashMethod;
  amount: number; // siempre > 0; el signo lo aplica `movementSign`
  detail: string;
};

// Una fila del libro tal como se pinta: el movimiento + el saldo TOTAL acumulado
// hasta esa fila inclusive. `signedAmount` es el monto ya con signo (+ entra, − sale),
// para no recalcular el signo en la UI.
export type LibroRow = LibroMovement & {
  signedAmount: number;
  runningTotal: number;
};

// El bloque RESUMEN de la planilla, con la misma semántica columna por columna.
export type LibroSummary = {
  opening: MethodAmounts; // Saldo inicial (arrastre de lo anterior al período)
  ingresos: MethodAmounts; // Ingresos (+) del período
  egresos: MethodAmounts; // Egresos (−) del período
  saldo: MethodAmounts; // SALDO ACTUAL = opening + ingresos − egresos
};

export type Libro = {
  rows: LibroRow[];
  summary: LibroSummary;
};

export function zeroAmounts(): MethodAmounts {
  return { EFECTIVO: 0, MP: 0, TARJETA: 0 };
}

// Total de un desglose. Única forma de obtener el total en todo el módulo.
export function totalOf(a: MethodAmounts): number {
  return round2(a.EFECTIVO + a.MP + a.TARJETA);
}

// Solo montos positivos y finitos cuentan (mismo blindaje que el arqueo: un dato
// basura nunca corrompe el saldo). La validación de entrada vive en la acción.
function usable(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0;
}

// Monto con signo según el TIPO: +entra, −sale, 0 la apertura. Delegado a
// `movementSign` para que exista UNA sola tabla de signos en el sistema.
export function signedAmount(m: { type: CashMovementType; amount: number }): number {
  if (!usable(m.amount)) return 0;
  return round2(movementSign(m.type) * m.amount);
}

// Suma los movimientos separando lo que ENTRA de lo que SALE, cada uno abierto por
// medio. La APERTURA no cae en ninguno de los dos (signo 0): en el libro el fondo
// inicial es el `opening`, no un ingreso del período — si contara como ingreso, el
// arrastre entre meses se sumaría dos veces.
export function splitByMethod(movements: readonly LibroMovement[]): {
  ingresos: MethodAmounts;
  egresos: MethodAmounts;
} {
  const ingresos = zeroAmounts();
  const egresos = zeroAmounts();
  for (const m of movements) {
    if (!usable(m.amount)) continue;
    const sign = movementSign(m.type);
    if (sign > 0) ingresos[m.method] += m.amount;
    else if (sign < 0) egresos[m.method] += m.amount;
  }
  for (const k of CASH_METHODS) {
    ingresos[k] = round2(ingresos[k]);
    egresos[k] = round2(egresos[k]);
  }
  return { ingresos, egresos };
}

// Saldo de arrastre: aplica TODOS los movimientos anteriores al período sobre un
// saldo cero, por medio. Es lo que la planilla llama "Saldo inicial" y que hoy se
// copia a mano de un mes al siguiente — acá se deriva, así no puede quedar mal
// tipeado ni desfasarse cuando se corrige una fila de un mes anterior.
export function openingFromHistory(previous: readonly LibroMovement[]): MethodAmounts {
  const acc = zeroAmounts();
  for (const m of previous) {
    if (!usable(m.amount)) continue;
    acc[m.method] += movementSign(m.type) * m.amount;
  }
  for (const k of CASH_METHODS) acc[k] = round2(acc[k]);
  return acc;
}

// Arma el libro del período: filas con saldo corrido + bloque resumen.
//
// El SALDO de cada fila es el TOTAL acumulado (los tres medios juntos), igual que la
// columna SALDO de la planilla, y arranca en el total del saldo inicial. Los
// movimientos se ordenan por fecha contable (`occurredAt`) y, a igualdad, por `id`,
// para que el saldo corrido sea ESTABLE: dos cargas del mismo día siempre rinden el
// mismo orden y el mismo acumulado, sin importar en qué orden las devolvió la base.
export function buildLibro(
  opening: MethodAmounts,
  movements: readonly LibroMovement[],
): Libro {
  const ordered = [...movements].sort((a, b) => {
    const d = a.occurredAt.getTime() - b.occurredAt.getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });

  let running = totalOf(opening);
  const rows: LibroRow[] = ordered.map((m) => {
    const signed = signedAmount(m);
    running = round2(running + signed);
    return { ...m, signedAmount: signed, runningTotal: running };
  });

  const { ingresos, egresos } = splitByMethod(ordered);
  const saldo = zeroAmounts();
  for (const k of CASH_METHODS) {
    saldo[k] = round2(opening[k] + ingresos[k] - egresos[k]);
  }

  return { rows, summary: { opening, ingresos, egresos, saldo } };
}

// --- Período mensual ---

// "2026-08" → { year: 2026, month: 8 }. Devuelve null si no es un mes válido: la
// pantalla lee el mes de la query string, que es entrada de usuario.
export function parseMonth(raw: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

// Mes siguiente/anterior, sin desbordar el año. Para la navegación « mes ».
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 };
}

export function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "agosto 2026" — rótulo humano del período, en español y sin depender del locale
// del navegador de quien mira (mismo criterio que datetime.ts).
export function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? "?"} ${year}`;
}
