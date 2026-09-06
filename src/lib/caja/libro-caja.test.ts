// Pruebas de la aritmética del LIBRO DE CAJA.
//
// La prueba fuerte no es sintética: es el mes de AGOSTO 2026 real de la planilla de
// CH Estética (283 asientos). Si `buildLibro` reproduce al peso el bloque RESUMEN que
// el negocio tipeó a mano, entonces la pantalla puede reemplazar la planilla.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLibro,
  openingFromHistory,
  splitByMethod,
  totalOf,
  zeroAmounts,
  parseMonth,
  shiftMonth,
  formatMonthKey,
  formatMonthLabel,
  dateBelongsToMonth,
  type LibroMovement,
} from "./libro-caja";
import { AGOSTO_2026, AGOSTO_2026_RESUMEN } from "./libro-caja.fixture";
import type { CashMethod } from "./cash-register";

const METHOD: Record<"E" | "M" | "T", CashMethod> = { E: "EFECTIVO", M: "MP", T: "TARJETA" };

// El fixture compacto → movimientos del dominio. El id es secuencial y con padding
// para que el desempate por id dentro del mismo día siga el orden de la planilla.
function agostoMovements(): LibroMovement[] {
  return AGOSTO_2026.map(([fecha, tipo, medio, monto], i) => ({
    id: `a${String(i).padStart(4, "0")}`,
    occurredAt: new Date(`${fecha}T12:00:00.000Z`),
    type: tipo === "I" ? ("INGRESO" as const) : ("EGRESO" as const),
    method: METHOD[medio],
    amount: monto,
    detail: `Asiento ${i}`,
  }));
}

function mov(over: Partial<LibroMovement> & { amount: number }): LibroMovement {
  return {
    id: over.id ?? "m1",
    occurredAt: over.occurredAt ?? new Date("2026-08-10T12:00:00.000Z"),
    type: over.type ?? "INGRESO",
    method: over.method ?? "EFECTIVO",
    amount: over.amount,
    detail: over.detail ?? "detalle",
  };
}

// ── La prueba que importa: el mes real ──────────────────────────────────────

test("agosto 2026 real: el libro reproduce al peso el RESUMEN que tipeó el negocio", () => {
  // La planilla arranca el mes con saldo inicial 0 en los tres medios.
  const { summary } = buildLibro(zeroAmounts(), agostoMovements());
  const esperado = AGOSTO_2026_RESUMEN;

  assert.equal(summary.ingresos.EFECTIVO, esperado.ingresos.EFECTIVO);
  assert.equal(summary.ingresos.MP, esperado.ingresos.MP);
  assert.equal(summary.ingresos.TARJETA, esperado.ingresos.TARJETA);
  assert.equal(totalOf(summary.ingresos), esperado.ingresos.TOTAL);

  assert.equal(summary.egresos.EFECTIVO, esperado.egresos.EFECTIVO);
  assert.equal(summary.egresos.MP, esperado.egresos.MP);
  assert.equal(summary.egresos.TARJETA, esperado.egresos.TARJETA);
  assert.equal(totalOf(summary.egresos), esperado.egresos.TOTAL);

  assert.equal(summary.saldo.EFECTIVO, esperado.saldo.EFECTIVO);
  assert.equal(summary.saldo.MP, esperado.saldo.MP);
  assert.equal(summary.saldo.TARJETA, esperado.saldo.TARJETA);
  assert.equal(totalOf(summary.saldo), esperado.saldo.TOTAL);
});

test("agosto 2026 real: el saldo corrido de la última fila cierra contra el SALDO ACTUAL", () => {
  const { rows } = buildLibro(zeroAmounts(), agostoMovements());
  assert.equal(rows.length, AGOSTO_2026.length);
  assert.equal(rows[rows.length - 1].runningTotal, AGOSTO_2026_RESUMEN.saldo.TOTAL);
});

// ── Saldo corrido ───────────────────────────────────────────────────────────

test("el saldo corrido arranca en el total del saldo inicial y acumula fila a fila", () => {
  const { rows } = buildLibro(
    { EFECTIVO: 1000, MP: 500, TARJETA: 0 },
    [
      mov({ id: "b", amount: 300, type: "INGRESO", method: "MP", occurredAt: new Date("2026-08-02T12:00:00Z") }),
      mov({ id: "a", amount: 200, type: "EGRESO", method: "EFECTIVO", occurredAt: new Date("2026-08-01T12:00:00Z") }),
    ],
  );
  // Ordena por fecha, no por el orden de entrada: primero el egreso del 01.
  assert.deepEqual(rows.map((r) => r.id), ["a", "b"]);
  assert.equal(rows[0].runningTotal, 1300); // 1500 − 200
  assert.equal(rows[1].runningTotal, 1600); // 1300 + 300
});

test("dos movimientos del mismo día desempatan por id → saldo corrido estable", () => {
  const dia = new Date("2026-08-05T12:00:00Z");
  const build = (ids: string[]) =>
    buildLibro(zeroAmounts(), ids.map((id) => mov({ id, amount: 100, occurredAt: dia })));
  // El mismo conjunto en distinto orden de entrada rinde el mismo orden de salida.
  assert.deepEqual(build(["z", "a", "m"]).rows.map((r) => r.id), ["a", "m", "z"]);
  assert.deepEqual(build(["m", "z", "a"]).rows.map((r) => r.id), ["a", "m", "z"]);
});

test("el monto con signo es + para ingreso y − para egreso", () => {
  const { rows } = buildLibro(zeroAmounts(), [
    mov({ id: "i", amount: 100, type: "INGRESO" }),
    mov({ id: "e", amount: 40, type: "EGRESO" }),
    mov({ id: "r", amount: 10, type: "RETIRO" }),
    mov({ id: "v", amount: 70, type: "VENTA" }),
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.id, r.signedAmount]));
  assert.equal(by.i, 100);
  assert.equal(by.e, -40);
  assert.equal(by.r, -10);
  assert.equal(by.v, 70);
});

// ── Apertura y arrastre ─────────────────────────────────────────────────────

test("la APERTURA no cuenta como ingreso del período (si no, el arrastre se duplica)", () => {
  const { summary } = buildLibro(
    { EFECTIVO: 5000, MP: 0, TARJETA: 0 },
    [mov({ id: "ap", amount: 5000, type: "APERTURA" })],
  );
  assert.equal(summary.ingresos.EFECTIVO, 0);
  assert.equal(summary.egresos.EFECTIVO, 0);
  assert.equal(summary.saldo.EFECTIVO, 5000); // el fondo entra por `opening`, una sola vez
});

test("el saldo inicial se deriva del historial anterior, por medio", () => {
  const opening = openingFromHistory([
    mov({ id: "1", amount: 1000, type: "INGRESO", method: "EFECTIVO" }),
    mov({ id: "2", amount: 250, type: "EGRESO", method: "EFECTIVO" }),
    mov({ id: "3", amount: 800, type: "INGRESO", method: "MP" }),
    mov({ id: "4", amount: 300, type: "RETIRO", method: "MP" }),
    mov({ id: "5", amount: 9999, type: "APERTURA", method: "TARJETA" }), // signo 0
  ]);
  assert.deepEqual(opening, { EFECTIVO: 750, MP: 500, TARJETA: 0 });
});

test("el saldo de arrastre puede ser negativo (se gastó más de lo que entró por ese medio)", () => {
  const opening = openingFromHistory([mov({ id: "1", amount: 400, type: "EGRESO", method: "MP" })]);
  assert.equal(opening.MP, -400);
  const { summary } = buildLibro(opening, []);
  assert.equal(summary.saldo.MP, -400);
});

test("el libro de un mes sin movimientos deja el saldo inicial intacto", () => {
  const opening = { EFECTIVO: 700200, MP: 1414230, TARJETA: 0 };
  const { rows, summary } = buildLibro(opening, []);
  assert.equal(rows.length, 0);
  assert.deepEqual(summary.saldo, opening);
  assert.equal(totalOf(summary.saldo), 2114430);
});

// ── Blindaje del dato ───────────────────────────────────────────────────────

test("un monto no usable (0, negativo o NaN) no mueve el saldo", () => {
  const { rows, summary } = buildLibro(zeroAmounts(), [
    mov({ id: "a", amount: 0 }),
    mov({ id: "b", amount: -50 }),
    mov({ id: "c", amount: Number.NaN }),
  ]);
  assert.equal(rows.length, 3); // se listan (son filas del ledger)…
  assert.deepEqual(rows.map((r) => r.signedAmount), [0, 0, 0]); // …pero no suman
  assert.equal(totalOf(summary.ingresos), 0);
  assert.equal(rows[2].runningTotal, 0);
});

test("splitByMethod separa entradas de salidas sin mezclar medios", () => {
  const { ingresos, egresos } = splitByMethod([
    mov({ id: "1", amount: 100, type: "INGRESO", method: "EFECTIVO" }),
    mov({ id: "2", amount: 200, type: "INGRESO", method: "MP" }),
    mov({ id: "3", amount: 30, type: "EGRESO", method: "MP" }),
    mov({ id: "4", amount: 50, type: "EGRESO", method: "TARJETA" }),
  ]);
  assert.deepEqual(ingresos, { EFECTIVO: 100, MP: 200, TARJETA: 0 });
  assert.deepEqual(egresos, { EFECTIVO: 0, MP: 30, TARJETA: 50 });
});

test("los decimales se redondean a 2 y no arrastran error binario", () => {
  const { summary } = buildLibro(zeroAmounts(), [
    mov({ id: "1", amount: 0.1, type: "INGRESO" }),
    mov({ id: "2", amount: 0.2, type: "INGRESO" }),
  ]);
  assert.equal(summary.ingresos.EFECTIVO, 0.3); // no 0.30000000000000004
});

// ── Período ─────────────────────────────────────────────────────────────────

test("parseMonth acepta YYYY-MM válido y rechaza el resto", () => {
  assert.deepEqual(parseMonth("2026-08"), { year: 2026, month: 8 });
  assert.equal(parseMonth("2026-13"), null);
  assert.equal(parseMonth("2026-00"), null);
  assert.equal(parseMonth("2026-8"), null);
  assert.equal(parseMonth("agosto"), null);
  assert.equal(parseMonth(null), null);
  assert.equal(parseMonth(""), null);
});

test("shiftMonth cruza el año en ambas direcciones", () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 8, 0), { year: 2026, month: 8 });
  assert.deepEqual(shiftMonth(2026, 6, -18), { year: 2024, month: 12 });
});

test("las etiquetas del período son estables y en español", () => {
  assert.equal(formatMonthKey(2026, 8), "2026-08");
  assert.equal(formatMonthKey(2026, 12), "2026-12");
  assert.equal(formatMonthLabel(2026, 8), "agosto 2026");
  assert.equal(formatMonthLabel(2026, 1), "enero 2026");
});

// ── Guarda contra los dos errores reales de la planilla ─────────────────────

test("dateBelongsToMonth atrapa el año mal tipeado y la fila que caería en otro mes", () => {
  assert.equal(dateBelongsToMonth("2026-05-11", "2026-05"), true);
  // El error real: 25 filas de mayo 2026 quedaron fechadas en 2025.
  assert.equal(dateBelongsToMonth("2025-05-11", "2026-05"), false);
  // El otro error real: cargar con la fecha de hoy mientras se mira otro mes.
  assert.equal(dateBelongsToMonth("2026-09-06", "2026-08"), false);
  assert.equal(dateBelongsToMonth("2026-08-31", "2026-08"), true);
  assert.equal(dateBelongsToMonth("2026-09-01", "2026-08"), false);
});

test("dateBelongsToMonth no advierte cuando no hay con qué comparar", () => {
  assert.equal(dateBelongsToMonth("2026-05-11", ""), true);
  assert.equal(dateBelongsToMonth("2026-05-11", "basura"), true);
  assert.equal(dateBelongsToMonth("no-es-fecha", "2026-05"), true);
});
