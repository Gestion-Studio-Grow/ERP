// Pruebas del CORTE INICIAL de caja.
//
// La prueba que manda es la del caso real: el histórico de CH Estética decía X, se cuenta
// Y, la diferencia queda ASENTADA como una fila visible del libro y el día siguiente
// arranca de Y — diga lo que diga la planilla. Es lo que ABRIL!D3 no hizo con el
// faltante de marzo. Las demás pruebas cercan las dos trampas del diseño: el corte no
// puede cambiar lo que muestran los meses históricos, y un movimiento retroactivo no
// puede mover el saldo operativo.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCorteInicial,
  corteAsMovements,
  saldoOperativoInicial,
  validateCorteInicial,
  verificarInvarianteCorte,
  contraAsientoRetroactivo,
  tramoDe,
  resumenCorte,
  corteMarker,
  esAjusteDeCorte,
  CORTE_INICIAL_PREFIX,
  type ArqueoInicial,
  type CorteMovement,
} from "./corte-inicial";
import { movementSign, type CashMethod } from "./cash-register";
import { buildLibro, openingFromHistory, totalOf, zeroAmounts, type LibroMovement } from "./libro-caja";
import { buildCierreDiario, partitionForCierre, isFrozenDay } from "./cierre-diario";
import { HOJA_AGOSTO_2026, HOJA_AGOSTO_2026_RESUMEN } from "./libro-caja.fixture";

const METHOD: Record<"E" | "M" | "T", CashMethod> = { E: "EFECTIVO", M: "MP", T: "TARJETA" };

// Igual que en cierre-diario.test.ts: los movimientos se anclan al mediodía UTC de su
// día y el "día del negocio" es la parte de fecha del ISO. Acá se prueba aritmética, no
// zona horaria (eso es de datetime.ts).
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const finDelDia = (day: string) => new Date(`${day}T23:59:00.000Z`);

function mov(over: Partial<CorteMovement> & { amount: number; day?: string }): CorteMovement {
  const { day, ...rest } = over;
  return {
    id: rest.id ?? `m-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: rest.occurredAt ?? new Date(`${day ?? "2026-05-10"}T12:00:00.000Z`),
    type: rest.type ?? "INGRESO",
    method: rest.method ?? "EFECTIVO",
    amount: rest.amount,
    detail: rest.detail ?? "detalle",
    collectionId: rest.collectionId ?? null,
    createdAt: rest.createdAt ?? null,
  };
}

function arqueo(e: number, m: number, t: number): ArqueoInicial {
  return { EFECTIVO: e, MP: m, TARJETA: t };
}

// La hoja "agosto" de la planilla no termina el 31/08: corre del 16/08 al 06/09 (el
// negocio cambia de hoja cuando se le acaba la hoja, no cuando cambia el mes). El corte
// sobre el fixture se hace en su último día con datos; con 31/08 quedarían 86 filas
// "posteriores al corte" y el saldo del RESUMEN no sería el del histórico absorbido.
const DIA_CORTE_FIXTURE = "2026-09-06";

function agostoMovements(): CorteMovement[] {
  return HOJA_AGOSTO_2026.map(([fecha, tipo, medio, monto], i) => ({
    id: `a${String(i).padStart(4, "0")}`,
    occurredAt: new Date(`${fecha}T12:00:00.000Z`),
    type: tipo === "I" ? ("INGRESO" as const) : ("EGRESO" as const),
    method: METHOD[medio],
    amount: monto,
    detail: `Asiento ${i}`,
  }));
}

// Histórico sintético de varios meses, con la forma del de CH: efectivo y MP se mueven,
// tarjeta está en cero en toda la serie.
function historicoSintetico(): CorteMovement[] {
  return [
    mov({ id: "h01", amount: 100000, method: "EFECTIVO", day: "2026-02-01", detail: "Saldo planilla" }),
    mov({ id: "h02", amount: 100000, method: "MP", day: "2026-02-01", detail: "Saldo planilla" }),
    mov({ id: "h03", amount: 652534, method: "EFECTIVO", day: "2026-03-05", detail: "Ingresos marzo" }),
    mov({ id: "h04", amount: 200000, method: "EFECTIVO", type: "EGRESO", day: "2026-03-20", detail: "Alquiler" }),
    mov({ id: "h05", amount: 300000, method: "MP", day: "2026-04-02", detail: "Ingresos abril" }),
    mov({ id: "h06", amount: 408933.99, method: "MP", type: "EGRESO", day: "2026-04-28", detail: "Comisiones" }), // MP negativo
    mov({ id: "h07", amount: 50000, method: "EFECTIVO", day: "2026-06-15", detail: "Ingresos junio" }),
  ];
}

// ── La prueba que importa: el caso real ─────────────────────────────────────

test("caso real CH: el histórico decía X, se cuenta Y, la diferencia queda asentada y el día siguiente arranca de Y", () => {
  // Histórico = el agosto 2026 real de la planilla (283 asientos). Lo que la planilla
  // decía que había al 31/08 es su bloque RESUMEN → saldo por medio.
  const historico = agostoMovements();
  const X = HOJA_AGOSTO_2026_RESUMEN.saldo;
  // Lo contado: los sobrantes REALES que la dueña encontró al margen (69.190 efectivo,
  // 16.723 MP) y que la planilla nunca asentó. Tarjeta: 0, como en toda la serie.
  const Y = arqueo(X.EFECTIVO + 69190, X.MP + 16723, 0);

  const corte = buildCorteInicial({ day: DIA_CORTE_FIXTURE, all: historico, arqueo: Y, dayOf });

  // Lo que decía el histórico es exactamente el saldo del libro.
  assert.deepEqual(corte.historico, { EFECTIVO: X.EFECTIVO, MP: X.MP, TARJETA: X.TARJETA });
  assert.equal(corte.historicoCount, HOJA_AGOSTO_2026.length);
  assert.equal(corte.posterioresAlCorte, 0);

  // El desvío queda medido y asentado: dos ajustes (efectivo y MP), ninguno en tarjeta.
  assert.deepEqual(corte.desvio, { EFECTIVO: 69190, MP: 16723, TARJETA: 0 });
  assert.equal(corte.ajustes.length, 2);
  const porMedio = Object.fromEntries(corte.ajustes.map((a) => [a.method, a]));
  assert.equal(porMedio.EFECTIVO.type, "INGRESO");
  assert.equal(porMedio.EFECTIVO.amount, 69190);
  assert.equal(porMedio.MP.type, "INGRESO");
  assert.equal(porMedio.MP.amount, 16723);
  assert.equal(porMedio.TARJETA, undefined);

  // El día siguiente arranca de Y: derivado del ledger (histórico + ajustes), no tipeado.
  const ledger = [...historico, ...corteAsMovements(corte, finDelDia(DIA_CORTE_FIXTURE))];
  assert.deepEqual(openingFromHistory(ledger), Y);
  assert.deepEqual(saldoOperativoInicial(corte), Y);

  // Y el primer día operativo (07/09) abre con Y: el libro "desde el corte" arranca ahí.
  const operativo = [mov({ id: "s1", amount: 30000, method: "MP", day: "2026-09-07", detail: "Primer cobro operativo" })];
  const libroOperativo = buildLibro(openingFromHistory(ledger), operativo);
  assert.deepEqual(libroOperativo.summary.opening, Y);
  assert.equal(libroOperativo.summary.saldo.MP, Y.MP + 30000);
  assert.equal(libroOperativo.rows[0].runningTotal, totalOf(Y) + 30000);
});

test("caso real marzo: el histórico decía 652.534 en efectivo, se cuentan 498.034 → EGRESO de 154.500 asentado, no al margen", () => {
  const historico = [mov({ id: "feb", amount: 652534, method: "EFECTIVO", day: "2026-02-28" })];
  const corte = buildCorteInicial({ day: "2026-03-31", all: historico, arqueo: arqueo(498034, 0, 0), dayOf });
  assert.equal(corte.ajustes.length, 1);
  assert.equal(corte.ajustes[0].type, "EGRESO");
  assert.equal(corte.ajustes[0].method, "EFECTIVO");
  assert.equal(corte.ajustes[0].amount, 154500);
  assert.match(corte.ajustes[0].detail, /faltante \$154\.500,00/);
  // Abril abre con lo contado, no con lo que decía la planilla.
  const ledger = [...historico, ...corteAsMovements(corte, finDelDia("2026-03-31"))];
  assert.equal(openingFromHistory(ledger).EFECTIVO, 498034);
});

// ── Saldo operativo = declarado, sin importar el histórico ──────────────────

test("el saldo operativo después del corte es EXACTAMENTE el declarado, diga lo que diga el histórico", () => {
  const Y = arqueo(1234567.89, 98765.43, 0);
  const historicos: CorteMovement[][] = [
    [], // tenant sin histórico
    historicoSintetico(), // histórico con MP negativo
    agostoMovements(), // histórico real
    [mov({ id: "x", amount: 99999999, method: "EFECTIVO", day: "2026-01-01" })], // histórico absurdo
    [mov({ id: "ap", amount: 5000, type: "APERTURA", method: "EFECTIVO", day: "2026-01-01" })], // signo 0
  ];
  for (const historico of historicos) {
    const corte = buildCorteInicial({ day: DIA_CORTE_FIXTURE, all: historico, arqueo: Y, dayOf });
    assert.equal(corte.posterioresAlCorte, 0);
    const ledger = [...historico, ...corteAsMovements(corte, finDelDia(DIA_CORTE_FIXTURE))];
    assert.deepEqual(openingFromHistory(ledger), Y, `histórico de ${historico.length} filas`);
    assert.deepEqual(saldoOperativoInicial(corte), Y);
    assert.ok(verificarInvarianteCorte(ledger, corte, { dayOf }).ok);
  }
});

test("un tenant sin histórico arranca de lo contado: el ajuste es un INGRESO por todo el arqueo", () => {
  const corte = buildCorteInicial({ day: "2026-08-31", all: [], arqueo: arqueo(50000, 120000, 0), dayOf });
  assert.deepEqual(corte.historico, zeroAmounts());
  assert.deepEqual(corte.desvio, { EFECTIVO: 50000, MP: 120000, TARJETA: 0 });
  assert.deepEqual(corte.ajustes.map((a) => [a.type, a.method, a.amount]), [
    ["INGRESO", "EFECTIVO", 50000],
    ["INGRESO", "MP", 120000],
  ]);
});

test("un histórico con MP NEGATIVO (el −8.933,99 de abril) se corrige con un solo ajuste al saldo real", () => {
  const historico = historicoSintetico();
  const corte = buildCorteInicial({ day: "2026-06-30", all: historico, arqueo: arqueo(600000, 250000, 0), dayOf });
  assert.equal(corte.historico.MP, -8933.99);
  assert.equal(corte.desvio.MP, 258933.99);
  const mp = corte.ajustes.find((a) => a.method === "MP")!;
  assert.equal(mp.type, "INGRESO");
  assert.equal(mp.amount, 258933.99);
  assert.equal(openingFromHistory([...historico, ...corteAsMovements(corte, finDelDia("2026-06-30"))]).MP, 250000);
});

// ── La diferencia se asienta y es visible ───────────────────────────────────

test("la diferencia contra el histórico se asienta como fila del libro, con el signo de movementSign", () => {
  const historico = historicoSintetico();
  // Efectivo: el histórico dice 602.534, se cuentan 448.034 (falta). MP: dice −8.933,99, hay 40.000 (sobra).
  const corte = buildCorteInicial({ day: "2026-06-30", all: historico, arqueo: arqueo(448034, 40000, 0), dayOf });
  for (const a of corte.ajustes) {
    const diff = corte.desvio[a.method];
    // Signo del ajuste sale de la ÚNICA tabla de signos del sistema y es el del desvío.
    assert.equal(Math.sign(diff), movementSign(a.type));
    assert.equal(a.amount, Math.abs(diff));
    assert.ok(a.amount > 0);
  }
  const ef = corte.ajustes.find((a) => a.method === "EFECTIVO")!;
  assert.equal(ef.type, "EGRESO");
  assert.equal(movementSign(ef.type), -1);
  const mp = corte.ajustes.find((a) => a.method === "MP")!;
  assert.equal(mp.type, "INGRESO");
  assert.equal(movementSign(mp.type), 1);

  // Visible: en el libro de junio, los ajustes son las ÚLTIMAS filas del día de corte,
  // con el monto con signo y el rótulo que dice de dónde salió cada número.
  const junio = [...historico, ...corteAsMovements(corte, finDelDia("2026-06-30"))].filter(
    (m) => dayOf(m.occurredAt).startsWith("2026-06"),
  );
  const { rows, summary } = buildLibro(openingFromHistory(historico.filter((m) => dayOf(m.occurredAt) < "2026-06")), junio);
  const ultimas = rows.slice(-2);
  assert.ok(ultimas.every((r) => esAjusteDeCorte(r)));
  assert.equal(ultimas.find((r) => r.method === "EFECTIVO")!.signedAmount, -154500);
  assert.equal(ultimas.find((r) => r.method === "MP")!.signedAmount, 48933.99);
  assert.match(ef.detail, new RegExp(`^${CORTE_INICIAL_PREFIX} 30/06/2026 — Efectivo: el histórico decía \\$602\\.534,00, se contaron \\$448\\.034,00 \\(faltante \\$154\\.500,00\\)$`));
  assert.match(mp.detail, /MP \/ Transf\.: el histórico decía -\$8\.933,99, se contaron \$40\.000,00 \(sobrante \$48\.933,99\)/);
  // El saldo del mes cierra en lo declarado.
  assert.deepEqual(summary.saldo, { EFECTIVO: 448034, MP: 40000, TARJETA: 0 });
});

test("los ajustes del corte son filas válidas del libro con ids estables y fechadas al final del día de corte", () => {
  const at = finDelDia(DIA_CORTE_FIXTURE);
  const corte = buildCorteInicial({ day: DIA_CORTE_FIXTURE, all: agostoMovements(), arqueo: arqueo(1, 2, 3), dayOf });
  const filas = corteAsMovements(corte, at);
  assert.equal(filas.length, 3);
  assert.deepEqual(filas.map((f) => f.id), ["corte-2026-09-06-0", "corte-2026-09-06-1", "corte-2026-09-06-2"]);
  for (const f of filas) {
    assert.equal(f.occurredAt, at);
    assert.ok(f.amount > 0);
    assert.ok(["INGRESO", "EGRESO"].includes(f.type));
    assert.ok(esAjusteDeCorte(f));
  }
  assert.equal(corteMarker("2026-08-31"), "corte-inicial:2026-08-31");
});

// ── Los meses históricos no cambian ─────────────────────────────────────────

test("un mes histórico anterior al corte sigue mostrando sus propios números después del corte", () => {
  const historico = historicoSintetico();
  const marzoDe = (ledger: readonly LibroMovement[]) => {
    const previos = ledger.filter((m) => dayOf(m.occurredAt) < "2026-03-01");
    const mes = ledger.filter((m) => dayOf(m.occurredAt).startsWith("2026-03"));
    return buildLibro(openingFromHistory(previos), mes);
  };
  const antes = marzoDe(historico);

  const corte = buildCorteInicial({ day: "2026-08-31", all: historico, arqueo: arqueo(10, 20, 0), dayOf });
  const despues = marzoDe([...historico, ...corteAsMovements(corte, finDelDia("2026-08-31"))]);

  assert.deepEqual(despues, antes);
  // Y marzo muestra lo que pasó en marzo: abrió con los 100.000 de la planilla, entraron
  // 652.534, salieron 200.000.
  assert.equal(antes.summary.opening.EFECTIVO, 100000);
  assert.equal(antes.summary.ingresos.EFECTIVO, 652534);
  assert.equal(antes.summary.egresos.EFECTIVO, 200000);
  assert.equal(antes.summary.saldo.EFECTIVO, 552534);
});

test("el mes del corte muestra el histórico de ese mes Y el ajuste, separados por tramo", () => {
  const historico = historicoSintetico();
  const corte = buildCorteInicial({ day: "2026-06-30", all: historico, arqueo: arqueo(600000, 0, 0), dayOf });
  const ledger = [...historico, ...corteAsMovements(corte, finDelDia("2026-06-30")), mov({ id: "op1", amount: 1000, day: "2026-07-01" })];
  const tramos = Object.fromEntries(ledger.map((m) => [m.id, tramoDe(m, "2026-06-30", dayOf)]));
  assert.equal(tramos.h01, "HISTORICO");
  assert.equal(tramos.h07, "HISTORICO"); // 15/06: mismo mes que el corte, sigue siendo histórico
  assert.equal(tramos["corte-2026-06-30-0"], "CORTE");
  assert.equal(tramos["corte-2026-06-30-1"], "CORTE");
  assert.equal(tramos.op1, "OPERATIVO");
  // Una fila común fechada el día del corte (sin el prefijo) es histórico, no corte.
  assert.equal(tramoDe(mov({ id: "z", amount: 1, day: "2026-06-30" }), "2026-06-30", dayOf), "HISTORICO");
});

// ── Movimientos retroactivos ────────────────────────────────────────────────

test("un movimiento cargado con fecha anterior al corte ROMPE el invariante y verificarInvarianteCorte lo detecta", () => {
  const historico = historicoSintetico();
  const Y = arqueo(500000, 100000, 0);
  const corte = buildCorteInicial({ day: "2026-08-31", all: historico, arqueo: Y, dayOf });
  const ejecutado = new Date("2026-09-01T10:00:00.000Z");
  const ledger = [...historico, ...corteAsMovements(corte, finDelDia("2026-08-31"))];
  assert.ok(verificarInvarianteCorte(ledger, corte, { dayOf, executedAt: ejecutado }).ok);

  // Alguien carga "el alquiler de julio que faltaba" con fecha de julio, después del corte.
  const retro = mov({
    id: "retro", amount: 1800000, type: "EGRESO", method: "EFECTIVO", day: "2026-07-10",
    detail: "Comisiones y alquiler julio", createdAt: new Date("2026-09-03T15:00:00.000Z"),
  });
  const roto = verificarInvarianteCorte([...ledger, retro], corte, { dayOf, executedAt: ejecutado });
  assert.equal(roto.ok, false);
  // El saldo operativo se movió exactamente en movementSign(type) * amount…
  assert.equal(roto.desvio.EFECTIVO, movementSign("EGRESO") * 1800000);
  assert.equal(roto.actual.EFECTIVO, Y.EFECTIVO - 1800000);
  assert.deepEqual(roto.esperado, Y);
  // …y se señala la fila intrusa (fechada antes del corte, tipeada después).
  assert.deepEqual(roto.sospechosos.map((m) => m.id), ["retro"]);
  // La defensa primaria es el congelamiento del cierre: el día del retro está congelado.
  assert.ok(isFrozenDay("2026-07-10", corte.day));
  assert.ok(!isFrozenDay("2026-09-01", corte.day));
});

test("un retroactivo con su contra-asiento NO mueve el saldo operativo y el mes histórico SÍ lo muestra", () => {
  const historico = historicoSintetico();
  const Y = arqueo(500000, 100000, 0);
  const corte = buildCorteInicial({ day: "2026-08-31", all: historico, arqueo: Y, dayOf });
  const ledger = [...historico, ...corteAsMovements(corte, finDelDia("2026-08-31"))];

  const retro = mov({ id: "retro", amount: 1800000, type: "EGRESO", method: "EFECTIVO", day: "2026-07-10", detail: "Comisiones y alquiler julio" });
  const contra = contraAsientoRetroactivo(retro, corte, { at: finDelDia("2026-08-31"), dayOf })!;
  assert.ok(contra);
  assert.equal(contra.type, "INGRESO");
  assert.equal(contra.method, "EFECTIVO");
  assert.equal(contra.amount, 1800000);
  assert.equal(movementSign(contra.type), -movementSign(retro.type));
  assert.equal(dayOf(contra.occurredAt), corte.day);
  assert.ok(esAjusteDeCorte(contra));
  assert.equal(tramoDe(contra, corte.day, dayOf), "CORTE");
  assert.match(contra.detail, /reclasificación del desvío en Efectivo por movimiento retroactivo del 10\/07\/2026: Comisiones y alquiler julio \(\$1\.800\.000,00\)/);

  const conPar = [...ledger, retro, contra];
  assert.ok(verificarInvarianteCorte(conPar, corte, { dayOf }).ok);
  assert.deepEqual(openingFromHistory(conPar), Y);

  // Julio ahora muestra el egreso que le faltaba.
  const julio = buildLibro(
    openingFromHistory(conPar.filter((m) => dayOf(m.occurredAt) < "2026-07-01")),
    conPar.filter((m) => dayOf(m.occurredAt).startsWith("2026-07")),
  );
  assert.equal(julio.summary.egresos.EFECTIVO, 1800000);
  // Y el mes del corte muestra el ajuste original y la reclasificación, ambos visibles.
  const agosto = conPar.filter((m) => dayOf(m.occurredAt).startsWith("2026-08"));
  assert.equal(agosto.filter(esAjusteDeCorte).length, corte.ajustes.length + 1);
});

test("el contra-asiento cubre VENTA y RETIRO, y no existe para APERTURA ni para montos no usables", () => {
  const corte = buildCorteInicial({ day: "2026-08-31", all: [], arqueo: arqueo(0, 0, 0), dayOf });
  const opts = { at: finDelDia("2026-08-31"), dayOf };
  assert.equal(contraAsientoRetroactivo(mov({ id: "v", amount: 100, type: "VENTA", day: "2026-05-01" }), corte, opts)!.type, "EGRESO");
  assert.equal(contraAsientoRetroactivo(mov({ id: "r", amount: 100, type: "RETIRO", day: "2026-05-01" }), corte, opts)!.type, "INGRESO");
  assert.equal(contraAsientoRetroactivo(mov({ id: "a", amount: 100, type: "APERTURA", day: "2026-05-01" }), corte, opts), null);
  assert.equal(contraAsientoRetroactivo(mov({ id: "n", amount: NaN, day: "2026-05-01" }), corte, opts), null);
  assert.equal(contraAsientoRetroactivo(mov({ id: "z", amount: 0, day: "2026-05-01" }), corte, opts), null);
});

test("un movimiento fechado DESPUÉS del corte no entra al cálculo y se informa como posterior", () => {
  const historico = [...historicoSintetico(), mov({ id: "post", amount: 77777, method: "MP", day: "2026-09-02" })];
  const corte = buildCorteInicial({ day: "2026-08-31", all: historico, arqueo: arqueo(1, 1, 0), dayOf });
  assert.equal(corte.posterioresAlCorte, 1);
  assert.equal(corte.historicoCount, historico.length - 1);
  assert.equal(corte.historico.MP, -8933.99); // sin los 77.777 posteriores
});

// ── Los tres medios, tarjeta en 0 ───────────────────────────────────────────

test("los tres medios se declaran; tarjeta en 0 con histórico en 0 no produce ajuste pero queda declarada", () => {
  const corte = buildCorteInicial({ day: DIA_CORTE_FIXTURE, all: agostoMovements(), arqueo: arqueo(700000, 1000000, 0), dayOf });
  assert.equal(corte.cierre.porMedio.TARJETA.declared, 0); // declarada, no null
  assert.equal(corte.historico.TARJETA, 0);
  assert.equal(corte.desvio.TARJETA, 0);
  assert.ok(!corte.ajustes.some((a) => a.method === "TARJETA"));
  assert.deepEqual(saldoOperativoInicial(corte), { EFECTIVO: 700000, MP: 1000000, TARJETA: 0 });
  const v = validateCorteInicial(corte, { nota: "Cajón contado 20:10; MP según app 20:15.", today: DIA_CORTE_FIXTURE, lastClosedDay: null });
  assert.deepEqual(v, { ok: true });
});

test("tarjeta en 0 con histórico en tarjeta ≠ 0 → se asienta el EGRESO que lo lleva a 0 (no se arrastra la planilla)", () => {
  const historico = [...historicoSintetico(), mov({ id: "t", amount: 55000, method: "TARJETA", day: "2026-05-05" })];
  const corte = buildCorteInicial({ day: "2026-08-31", all: historico, arqueo: arqueo(1, 1, 0), dayOf });
  const t = corte.ajustes.find((a) => a.method === "TARJETA")!;
  assert.equal(t.type, "EGRESO");
  assert.equal(t.amount, 55000);
  assert.equal(openingFromHistory([...historico, ...corteAsMovements(corte, finDelDia("2026-08-31"))]).TARJETA, 0);
  // Contraste con el cierre diario común: ahí tarjeta sin declarar ARRASTRA los 55.000.
  const p = partitionForCierre(historico, { day: "2026-08-31", lastClosedDay: null, dayOf });
  const cierreComun = buildCierreDiario({ ...p, day: "2026-08-31", declared: { EFECTIVO: 1, MP: 1, TARJETA: null } });
  assert.equal(cierreComun.porMedio.TARJETA.declared, null);
  assert.ok(!cierreComun.ajustes.some((a) => a.method === "TARJETA"));
});

test("un medio sin declarar (NaN) no inventa un número y la validación lo rechaza", () => {
  const corte = buildCorteInicial({ day: "2026-08-31", all: historicoSintetico(), arqueo: { EFECTIVO: 1, MP: 1, TARJETA: NaN }, dayOf });
  assert.equal(corte.cierre.porMedio.TARJETA.declared, null);
  assert.equal(corte.declarado.TARJETA, corte.historico.TARJETA); // arrastra, no inventa
  const v = validateCorteInicial(corte, { nota: "ok", today: "2026-09-01", lastClosedDay: null });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.errors.some((e) => e.includes("Falta declarar Tarjeta")));
});

// ── Validación ──────────────────────────────────────────────────────────────

test("validateCorteInicial: nota obligatoria siempre, aunque cuadre", () => {
  const historico = [mov({ id: "1", amount: 1000, day: "2026-08-01" })];
  const corte = buildCorteInicial({ day: "2026-08-31", all: historico, arqueo: arqueo(1000, 0, 0), dayOf });
  assert.equal(corte.cierre.estado, "CUADRA");
  const sin = validateCorteInicial(corte, { nota: "  ", today: "2026-09-01", lastClosedDay: null });
  assert.equal(sin.ok, false);
  if (!sin.ok) assert.ok(sin.errors.some((e) => e.startsWith("Falta la nota del corte")));
  assert.deepEqual(validateCorteInicial(corte, { nota: "contado", today: "2026-09-01", lastClosedDay: null }), { ok: true });
});

test("validateCorteInicial: no puede haber un cierre anterior — el corte es el PRIMER cierre", () => {
  const corte = buildCorteInicial({ day: "2026-08-31", all: [], arqueo: arqueo(0, 0, 0), dayOf });
  const v = validateCorteInicial(corte, { nota: "ok", today: "2026-09-01", lastClosedDay: "2026-08-15" });
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.equal(v.errors.length, 1);
    assert.match(v.errors[0], /Ya hay un cierre registrado \(15\/08\/2026\)/);
  }
});

test("validateCorteInicial: hereda las reglas del cierre (fecha futura, negativo, efectivo) y las devuelve todas juntas", () => {
  const corte = buildCorteInicial({ day: "2026-09-30", all: [], arqueo: { EFECTIVO: NaN, MP: -5, TARJETA: 0 }, dayOf });
  const v = validateCorteInicial(corte, { nota: "", today: "2026-09-06", lastClosedDay: null });
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.ok(v.errors.some((e) => e.includes("todavía no pasó")));
    assert.ok(v.errors.some((e) => e.includes("Falta el efectivo contado")));
    assert.ok(v.errors.some((e) => e.includes("no puede ser negativo")));
    assert.ok(v.errors.some((e) => e.startsWith("Falta la nota del corte")));
    assert.ok(v.errors.length >= 4);
  }
});

// ── Redondeo y resumen ──────────────────────────────────────────────────────

test("el desvío y los ajustes se redondean a 2 decimales y no arrastran error binario", () => {
  const historico = [
    mov({ id: "1", amount: 0.1, day: "2026-08-01" }),
    mov({ id: "2", amount: 0.2, day: "2026-08-02" }),
  ];
  const corte = buildCorteInicial({ day: "2026-08-31", all: historico, arqueo: arqueo(0.4, 0, 0), dayOf });
  assert.equal(corte.historico.EFECTIVO, 0.3);
  assert.equal(corte.desvio.EFECTIVO, 0.1);
  assert.equal(corte.ajustes[0].amount, 0.1);
  assert.equal(openingFromHistory([...historico, ...corteAsMovements(corte, finDelDia("2026-08-31"))]).EFECTIVO, 0.4);
});

test("resumenCorte arma la tabla por medio y el total con la misma aritmética", () => {
  const corte = buildCorteInicial({ day: "2026-06-30", all: historicoSintetico(), arqueo: arqueo(448034, 40000, 0), dayOf });
  const r = resumenCorte(corte);
  assert.equal(r.dayLabel, "30/06/2026");
  assert.equal(r.historicoCount, 7);
  assert.deepEqual(r.porMedio.map((p) => p.method), ["EFECTIVO", "MP", "TARJETA"]);
  assert.equal(r.total.historico, totalOf(corte.historico));
  assert.equal(r.total.declarado, 488034);
  assert.equal(r.total.desvio, -105566.01);
  assert.equal(r.ajustes.length, 2);
});
