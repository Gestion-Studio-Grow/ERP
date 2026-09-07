// Pruebas de la aritmética del CIERRE DIARIO.
//
// Dos pruebas mandan: (1) el faltante REAL de marzo de la planilla de CH Estética
// ($154.500 anotado al margen y nunca asentado, con abril abriendo como si la plata
// estuviera) tiene que quedar asentado por construcción; (2) los sobrantes REALES que
// la dueña encontró en agosto (69.190 efectivo, 16.723 MP) sobre el mes del fixture
// tienen que producir los ajustes y el arrastre correctos. Si esas dos pasan, el cierre
// hace lo que la planilla no hacía.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCierreDiario,
  ajustesAsMovements,
  openingAfterCierre,
  validateCierre,
  partitionForCierre,
  isFrozenDay,
  frozenDayMessage,
  cashMethodFromPaymentMethod,
  isDayKey,
  compareDayKeys,
  nextDayKey,
  formatDayLabel,
  type CierreMovement,
  type DeclaredAmounts,
} from "./cierre-diario";
import { movementSign, type CashMethod } from "./cash-register";
import { openingFromHistory, totalOf, type LibroMovement } from "./libro-caja";
import { HOJA_AGOSTO_2026, HOJA_AGOSTO_2026_RESUMEN } from "./libro-caja.fixture";

const METHOD: Record<"E" | "M" | "T", CashMethod> = { E: "EFECTIVO", M: "MP", T: "TARJETA" };

// Los movimientos se anclan al mediodía UTC de su día, y el "día del negocio" en los
// tests es simplemente la parte de fecha del ISO: acá no se prueba la zona horaria
// (eso es de datetime.ts), se prueba la aritmética.
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

function mov(over: Partial<CierreMovement> & { amount: number; day?: string }): CierreMovement {
  const { day, ...rest } = over;
  return {
    id: rest.id ?? `m-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: rest.occurredAt ?? new Date(`${day ?? "2026-09-06"}T12:00:00.000Z`),
    type: rest.type ?? "INGRESO",
    method: rest.method ?? "EFECTIVO",
    amount: rest.amount,
    detail: rest.detail ?? "detalle",
    collectionId: rest.collectionId ?? null,
    collectionOrigin: rest.collectionOrigin ?? null,
  };
}

function declared(e: number | null, m: number | null = null, t: number | null = null): DeclaredAmounts {
  return { EFECTIVO: e, MP: m, TARJETA: t };
}

function agostoMovements(): CierreMovement[] {
  return HOJA_AGOSTO_2026.map(([fecha, tipo, medio, monto], i) => ({
    id: `a${String(i).padStart(4, "0")}`,
    occurredAt: new Date(`${fecha}T12:00:00.000Z`),
    type: tipo === "I" ? ("INGRESO" as const) : ("EGRESO" as const),
    method: METHOD[medio],
    amount: monto,
    detail: `Asiento ${i}`,
  }));
}

// ── El caso real: faltante detectado y ASENTADO ────────────────────────────

test("faltante real de marzo: cerrar con $154.500 de menos lo asienta y abril abre con lo contado", () => {
  // MARZO!M3 = D6 − 154500 = 498.034: el libro decía 652.534 en efectivo, se contaron
  // 498.034. En la planilla quedó como nota al margen y ABRIL!D3 abrió en 652.534.
  const previous = [mov({ id: "feb", amount: 652534, day: "2026-02-28", method: "EFECTIVO" })];
  const cierre = buildCierreDiario({
    day: "2026-03-31",
    previous,
    movements: [],
    declared: declared(498034),
  });

  assert.equal(cierre.porMedio.EFECTIVO.expected, 652534);
  assert.equal(cierre.porMedio.EFECTIVO.declared, 498034);
  assert.equal(cierre.porMedio.EFECTIVO.diff, -154500);
  assert.equal(cierre.estado, "FALTANTE");

  // El ajuste existe, es un EGRESO en efectivo por el faltante exacto, y dice de dónde salió.
  assert.equal(cierre.ajustes.length, 1);
  assert.deepEqual(cierre.ajustes[0], {
    type: "EGRESO",
    method: "EFECTIVO",
    amount: 154500,
    detail: "Diferencia de caja 31/03/2026: faltante en Efectivo",
  });

  // Y no se puede cerrar sin decir por qué: el faltante no puede quedar mudo.
  const sinNota = validateCierre(cierre, { note: "", today: "2026-04-01", lastClosedDay: null });
  assert.equal(sinNota.ok, false);
  const conNota = validateCierre(cierre, { note: "Faltante sin explicar, se revisa", today: "2026-04-01", lastClosedDay: null });
  assert.equal(conNota.ok, true);

  // Abril abre con lo CONTADO (498.034), no con lo que decía la planilla (652.534).
  const ajustes = ajustesAsMovements(cierre, new Date("2026-03-31T23:59:00.000Z"));
  const aperturaAbril = openingFromHistory([...previous, ...ajustes]);
  assert.equal(aperturaAbril.EFECTIVO, 498034);
  assert.deepEqual(aperturaAbril, openingAfterCierre(cierre));
});

// ── El otro caso real: agosto 2026 con los sobrantes que encontró la dueña ─

test("agosto 2026 real: cerrar el mes con los sobrantes de la dueña asienta 69.190 y 16.723 y el arrastre cierra", () => {
  const all = agostoMovements();
  // Primer cierre del sistema: el 31/08, sin cierre anterior → abarca desde el origen.
  const p1 = partitionForCierre(all, { day: "2026-08-31", lastClosedDay: null, dayOf });
  assert.equal(p1.since, null);
  const esperadoAgosto = buildCierreDiario({ ...p1, day: "2026-08-31", declared: declared(null) });
  const E = esperadoAgosto.porMedio.EFECTIVO.expected;
  const M = esperadoAgosto.porMedio.MP.expected;

  // K287: 999.090 contados contra 929.900 corridos → sobran 69.190 en efectivo.
  // K290: sobran 16.723 en transferencia. Se declara esperado + sobrante real.
  const c1 = buildCierreDiario({
    ...p1,
    day: "2026-08-31",
    declared: declared(E + 69190, M + 16723),
  });
  assert.equal(c1.estado, "SOBRANTE");
  assert.equal(c1.porMedio.EFECTIVO.diff, 69190);
  assert.equal(c1.porMedio.MP.diff, 16723);
  assert.equal(c1.porMedio.TARJETA.diff, null); // la tarjeta no se concilia por día
  assert.equal(c1.total.diff, 85913);
  assert.deepEqual(
    c1.ajustes.map((a) => [a.type, a.method, a.amount]),
    [["INGRESO", "EFECTIVO", 69190], ["INGRESO", "MP", 16723]],
  );

  // Se asientan los ajustes y se cierra el 06/09 (el resto del fixture) cuadrando.
  const ledger = [...all, ...ajustesAsMovements(c1, new Date("2026-08-31T23:59:00.000Z"))];
  const p2 = partitionForCierre(ledger, { day: "2026-09-06", lastClosedDay: "2026-08-31", dayOf });
  assert.equal(p2.since, "2026-09-01");
  const c2 = buildCierreDiario({ ...p2, day: "2026-09-06", declared: declared(null) });

  // El 01/09 abre con lo que se declaró el 31/08, por medio.
  assert.deepEqual(
    { EFECTIVO: c2.porMedio.EFECTIVO.opening, MP: c2.porMedio.MP.opening, TARJETA: c2.porMedio.TARJETA.opening },
    openingAfterCierre(c1),
  );
  // Y el saldo final del período es el RESUMEN real de la planilla + los dos sobrantes.
  assert.equal(c2.porMedio.EFECTIVO.expected, HOJA_AGOSTO_2026_RESUMEN.saldo.EFECTIVO + 69190);
  assert.equal(c2.porMedio.MP.expected, HOJA_AGOSTO_2026_RESUMEN.saldo.MP + 16723);
  assert.equal(c2.total.expected, HOJA_AGOSTO_2026_RESUMEN.saldo.TOTAL + 85913);

  const c2ok = buildCierreDiario({
    ...p2,
    day: "2026-09-06",
    declared: declared(c2.porMedio.EFECTIVO.expected, c2.porMedio.MP.expected),
  });
  assert.equal(c2ok.estado, "CUADRA");
  assert.equal(c2ok.ajustes.length, 0);
});

// ── Día sin movimientos ─────────────────────────────────────────────────────

test("un día sin movimientos: el esperado es la apertura y si se cuenta lo mismo, cuadra", () => {
  const previous = [
    mov({ id: "1", amount: 1000, day: "2026-09-05", method: "EFECTIVO" }),
    mov({ id: "2", amount: 500, day: "2026-09-05", method: "MP" }),
  ];
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    since: "2026-09-06",
    previous,
    movements: [],
    declared: declared(1000, 500),
  });
  assert.equal(cierre.movementCount, 0);
  assert.equal(cierre.porMedio.EFECTIVO.opening, 1000);
  assert.equal(cierre.porMedio.EFECTIVO.ingresos, 0);
  assert.equal(cierre.porMedio.EFECTIVO.egresos, 0);
  assert.equal(cierre.porMedio.EFECTIVO.expected, 1000);
  assert.equal(cierre.porMedio.MP.expected, 500);
  assert.equal(cierre.total.expected, 1500);
  assert.equal(cierre.estado, "CUADRA");
  assert.deepEqual(cierre.ajustes, []);
});

test("un día sin movimientos y sin nada declarado no es un cierre todavía", () => {
  const cierre = buildCierreDiario({ day: "2026-09-06", previous: [], movements: [], declared: declared(null) });
  assert.equal(cierre.estado, "SIN_DECLARAR");
  assert.equal(cierre.total.declared, 0);
  assert.equal(cierre.total.diff, 0);
  const v = validateCierre(cierre, { note: "", today: "2026-09-06", lastClosedDay: null });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.errors.some((e) => e.includes("efectivo contado")));
});

// ── Día con los tres medios ─────────────────────────────────────────────────

test("un día con los tres medios separa ingresos y egresos por medio y el total es la suma", () => {
  const movements = [
    mov({ id: "a", amount: 30000, type: "INGRESO", method: "EFECTIVO", detail: "Limpieza facial" }),
    mov({ id: "b", amount: 42000, type: "INGRESO", method: "MP", detail: "Masajes" }),
    mov({ id: "c", amount: 55000, type: "INGRESO", method: "TARJETA", detail: "Tratamiento" }),
    mov({ id: "d", amount: 12000, type: "EGRESO", method: "EFECTIVO", detail: "Agua" }),
    mov({ id: "e", amount: 46800, type: "EGRESO", method: "MP", detail: "Comisión profesional" }),
  ];
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements,
    declared: declared(18000, -4800, 55000),
  });
  assert.equal(cierre.movementCount, 5);
  assert.deepEqual(
    [cierre.porMedio.EFECTIVO.ingresos, cierre.porMedio.MP.ingresos, cierre.porMedio.TARJETA.ingresos],
    [30000, 42000, 55000],
  );
  assert.deepEqual(
    [cierre.porMedio.EFECTIVO.egresos, cierre.porMedio.MP.egresos, cierre.porMedio.TARJETA.egresos],
    [12000, 46800, 0],
  );
  assert.deepEqual(
    [cierre.porMedio.EFECTIVO.expected, cierre.porMedio.MP.expected, cierre.porMedio.TARJETA.expected],
    [18000, -4800, 55000],
  );
  assert.equal(cierre.total.ingresos, 127000);
  assert.equal(cierre.total.egresos, 58800);
  assert.equal(cierre.total.expected, 68200);
  assert.equal(cierre.estado, "CUADRA");

  // Un saldo esperado NEGATIVO en MP es posible en el libro (base 0 con más egresos que
  // ingresos), pero un saldo DECLARADO negativo no existe en el mundo real: la
  // validación lo frena aunque cuadre.
  const v = validateCierre(cierre, { note: "", today: "2026-09-06", lastClosedDay: null });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.errors.some((e) => e.includes("MP / Transf.") && e.includes("negativo")));
});

// ── Diferencia positiva y negativa ──────────────────────────────────────────

test("diferencia positiva: sobra plata → estado SOBRANTE y un INGRESO de ajuste por el sobrante", () => {
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [mov({ id: "a", amount: 100000, method: "EFECTIVO" })],
    declared: declared(100500),
  });
  assert.equal(cierre.estado, "SOBRANTE");
  assert.equal(cierre.porMedio.EFECTIVO.diff, 500);
  assert.equal(cierre.total.diff, 500);
  assert.deepEqual(cierre.ajustes.map((a) => [a.type, a.amount]), [["INGRESO", 500]]);
});

test("diferencia negativa: falta plata → estado FALTANTE y un EGRESO de ajuste por el faltante", () => {
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [mov({ id: "a", amount: 100000, method: "EFECTIVO" })],
    declared: declared(97300),
  });
  assert.equal(cierre.estado, "FALTANTE");
  assert.equal(cierre.porMedio.EFECTIVO.diff, -2700);
  assert.deepEqual(cierre.ajustes.map((a) => [a.type, a.amount]), [["EGRESO", 2700]]);
});

test("sobra en un medio y falta en otro → MIXTO (el cobro se anotó en el medio equivocado)", () => {
  // Se cobraron 20.000 por MP pero se cargaron como efectivo.
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [mov({ id: "a", amount: 20000, method: "EFECTIVO", detail: "Seña mal cargada" })],
    declared: declared(0, 20000),
  });
  assert.equal(cierre.estado, "MIXTO");
  assert.equal(cierre.porMedio.EFECTIVO.diff, -20000);
  assert.equal(cierre.porMedio.MP.diff, 20000);
  assert.equal(cierre.total.diff, 0); // el total cuadra, pero por medio no: por eso el estado no es CUADRA
  assert.equal(cierre.ajustes.length, 2);
});

test("el signo de cada ajuste sale de la ÚNICA tabla de signos del sistema (movementSign)", () => {
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [],
    declared: declared(100, -0, 0), // MP −0 → 0, no hay ajuste ahí
  });
  // Sobrante → tipo con signo +1; faltante → tipo con signo −1. Si alguien cambiara
  // qué tipo es el ajuste, este test lo atrapa contra la tabla de cash-register.ts.
  for (const a of cierre.ajustes) {
    const m = cierre.porMedio[a.method];
    assert.equal(movementSign(a.type), Math.sign(m.diff ?? 0));
  }
  assert.equal(cierre.ajustes.length, 1);
  assert.equal(movementSign(cierre.ajustes[0].type), 1);
});

test("los ajustes se redondean a 2 decimales y no arrastran error binario", () => {
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [mov({ id: "a", amount: 0.1 }), mov({ id: "b", amount: 0.2 })],
    declared: declared(0.4),
  });
  assert.equal(cierre.porMedio.EFECTIVO.expected, 0.3);
  assert.equal(cierre.porMedio.EFECTIVO.diff, 0.1);
  assert.equal(cierre.ajustes[0].amount, 0.1);
});

// ── Señas ───────────────────────────────────────────────────────────────────

test("una seña es un ingreso del día que entró, por el medio que entró: cuenta una vez y no deja deuda", () => {
  // Día 1: seña de 20.000 por MP para un servicio de 60.000. El libro registra los
  // 20.000 que ENTRARON; los 40.000 que faltan no son deuda todavía (el servicio no se
  // hizo) y no aparecen en ningún lado del cierre.
  const dia1 = buildCierreDiario({
    day: "2026-09-05",
    previous: [],
    movements: [mov({ id: "s", amount: 20000, method: "MP", detail: "Seña — tratamiento facial", day: "2026-09-05" })],
    declared: declared(0, 20000),
  });
  assert.equal(dia1.porMedio.MP.ingresos, 20000);
  assert.equal(dia1.total.expected, 20000);
  assert.equal(dia1.estado, "CUADRA");
  assert.equal(dia1.cobrosCarteraCount, 0);
});

test("dos señas iguales el mismo día son dos filas y suman dos veces (no se deduplican por aritmética)", () => {
  // La auditoría lo marcó como "a revisar, no error": la guarda contra el duplicado
  // vive en la acción de alta (pide confirmación), no acá. Si están las dos filas, valen.
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [
      mov({ id: "s1", amount: 15000, method: "MP", detail: "Seña" }),
      mov({ id: "s2", amount: 15000, method: "MP", detail: "Seña" }),
    ],
    declared: declared(0, 30000),
  });
  assert.equal(cierre.porMedio.MP.ingresos, 30000);
  assert.equal(cierre.estado, "CUADRA");
});

// ── Puente con cuentas a cobrar: contar una sola vez ────────────────────────

test("un cobro que vino de cuentas a cobrar entra al esperado UNA vez y se reporta aparte como cobro de cartera", () => {
  // Día 2 del ejemplo de la seña: la clienta pagó 30.000 en efectivo al retirarse y
  // quedó debiendo 10.000 → nace una cuenta a cobrar por 10.000 (fuera del libro).
  // Día 3: se cobra esa cuenta desde /cuentas-a-cobrar → la Collection escribe el
  // INGRESO en el libro con su `collectionId`. Nadie lo vuelve a tipear.
  const movements = [
    mov({ id: "pago", amount: 30000, method: "EFECTIVO", detail: "Saldo tratamiento facial", day: "2026-09-06" }),
    mov({ id: "cob", amount: 10000, method: "MP", detail: "Cobro cuenta a cobrar", day: "2026-09-06", collectionId: "col_1", collectionOrigin: "RECEIVABLE" }),
  ];
  const cierre = buildCierreDiario({ day: "2026-09-06", previous: [], movements, declared: declared(30000, 10000) });

  assert.equal(cierre.porMedio.MP.ingresos, 10000); // una sola vez
  assert.equal(cierre.porMedio.MP.cobrosCartera, 10000); // y visible como cobro de cartera
  assert.equal(cierre.porMedio.EFECTIVO.cobrosCartera, 0);
  assert.equal(cierre.cobrosCarteraCount, 1);
  assert.equal(cierre.total.ingresos, 40000);
  assert.equal(cierre.estado, "CUADRA");
});

test("un COBRO DE TURNO no se cuenta como cobro de cartera, aunque tenga rastro a un cobro", () => {
  // El bug que esto fija: el cierre rotulaba "vinieron de cuentas a cobrar" a TODO
  // movimiento con `collectionId`, y el único que lo escribe hoy es el cobro de turno.
  // O sea que la pantalla decía, sobre plata real, que una seña de turno era fiado.
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [
      mov({ id: "senia", amount: 10000, method: "MP", detail: "Turno · Limpieza facial — Ana", collectionId: "col_turno", collectionOrigin: "APPOINTMENT" }),
      mov({ id: "fiado", amount: 4000, method: "MP", detail: "Cobro de fiado", collectionId: "col_ar", collectionOrigin: "RECEIVABLE" }),
    ],
    declared: declared(0, 14000),
  });
  assert.equal(cierre.porMedio.MP.ingresos, 14000, "los dos entran al esperado");
  assert.equal(cierre.porMedio.MP.cobrosCartera, 4000, "sólo el fiado se rotula como cartera");
  assert.equal(cierre.cobrosCarteraCount, 1);
  assert.equal(cierre.estado, "CUADRA");
});

test("un movimiento con rastro pero sin origen conocido no se rotula (fail-closed del rótulo)", () => {
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [mov({ id: "x", amount: 5000, method: "MP", collectionId: "col_?", collectionOrigin: null })],
    declared: declared(0, 5000),
  });
  assert.equal(cierre.cobrosCarteraCount, 0);
  assert.equal(cierre.porMedio.MP.ingresos, 5000);
});

test("un egreso con collectionId (pago a proveedor de cuentas a pagar) no se cuenta como cobro de cartera", () => {
  const cierre = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [mov({ id: "pp", amount: 5000, type: "EGRESO", method: "MP", collectionId: "col_ap", collectionOrigin: "RECEIVABLE" })],
    declared: declared(0, -5000),
  });
  assert.equal(cierre.cobrosCarteraCount, 0);
  assert.equal(cierre.porMedio.MP.cobrosCartera, 0);
  assert.equal(cierre.porMedio.MP.egresos, 5000);
});

test("la traducción PaymentMethod → CashMethod es una sola y frena ante lo desconocido", () => {
  assert.equal(cashMethodFromPaymentMethod("EFECTIVO"), "EFECTIVO");
  assert.equal(cashMethodFromPaymentMethod("MERCADOPAGO"), "MP");
  assert.equal(cashMethodFromPaymentMethod("TRANSFERENCIA"), "MP");
  assert.equal(cashMethodFromPaymentMethod("TARJETA"), null); // no existe en PaymentMethod hoy
  assert.equal(cashMethodFromPaymentMethod(""), null);
});

// ── Arrastre entre días ─────────────────────────────────────────────────────

test("el arrastre entre días cierra: la apertura del día N+1 es exactamente lo declarado el día N", () => {
  const ledger: CierreMovement[] = [
    mov({ id: "1", amount: 50000, method: "EFECTIVO", day: "2026-09-04" }),
    mov({ id: "2", amount: 80000, method: "MP", day: "2026-09-04" }),
    mov({ id: "3", amount: 7000, type: "EGRESO", method: "EFECTIVO", day: "2026-09-04" }),
  ];
  // Día 4: se cuentan 42.500 (500 de más) y MP cuadra.
  const p4 = partitionForCierre(ledger, { day: "2026-09-04", lastClosedDay: null, dayOf });
  const c4 = buildCierreDiario({ ...p4, day: "2026-09-04", declared: declared(43500, 80000) });
  assert.equal(c4.porMedio.EFECTIVO.diff, 500);
  ledger.push(...ajustesAsMovements(c4, new Date("2026-09-04T23:59:00.000Z")));

  // Día 5: un movimiento nuevo.
  ledger.push(mov({ id: "4", amount: 10000, method: "EFECTIVO", day: "2026-09-05" }));
  const p5 = partitionForCierre(ledger, { day: "2026-09-05", lastClosedDay: "2026-09-04", dayOf });
  const c5 = buildCierreDiario({ ...p5, day: "2026-09-05", declared: declared(53500, 80000) });

  // Apertura del 05 = lo DECLARADO el 04 (no lo que decía el libro antes del ajuste).
  assert.equal(c5.porMedio.EFECTIVO.opening, 43500);
  assert.equal(c5.porMedio.MP.opening, 80000);
  assert.deepEqual(openingAfterCierre(c4), { EFECTIVO: 43500, MP: 80000, TARJETA: 0 });
  assert.equal(c5.porMedio.EFECTIVO.expected, 53500);
  assert.equal(c5.estado, "CUADRA");
  assert.equal(c5.since, "2026-09-05");
  assert.equal(c5.movementCount, 1); // el ajuste del 04 quedó en `previous`, no en el período
});

test("un día sin cierre propio queda absorbido por el cierre siguiente (arqueo desde el último cierre)", () => {
  const ledger: CierreMovement[] = [
    mov({ id: "1", amount: 1000, day: "2026-09-04" }),
    mov({ id: "2", amount: 2000, day: "2026-09-05" }), // sábado sin cierre
    mov({ id: "3", amount: 3000, day: "2026-09-06" }),
    mov({ id: "4", amount: 9999, day: "2026-09-07" }), // el futuro no entra
  ];
  const p = partitionForCierre(ledger, { day: "2026-09-06", lastClosedDay: "2026-09-04", dayOf });
  const c = buildCierreDiario({ ...p, day: "2026-09-06", declared: declared(6000) });
  assert.equal(c.since, "2026-09-05");
  assert.equal(c.movementCount, 2); // 05 y 06
  assert.equal(c.porMedio.EFECTIVO.opening, 1000);
  assert.equal(c.porMedio.EFECTIVO.expected, 6000);
  assert.equal(c.estado, "CUADRA");
});

test("la apertura derivada del historial coincide con openingAfterCierre aunque haya medios sin declarar", () => {
  const previous = [mov({ id: "t", amount: 55000, method: "TARJETA", day: "2026-09-01" })];
  const c = buildCierreDiario({ day: "2026-09-06", previous, movements: [], declared: declared(0, 0) });
  // Tarjeta no declarada → arrastra el esperado, no 0.
  assert.deepEqual(openingAfterCierre(c), { EFECTIVO: 0, MP: 0, TARJETA: 55000 });
  const derivado = openingFromHistory([...previous, ...ajustesAsMovements(c, new Date("2026-09-06T23:59:00.000Z"))]);
  assert.deepEqual(derivado, openingAfterCierre(c));
  assert.equal(totalOf(derivado), 55000);
});

// ── Congelamiento: lo cerrado no se toca ────────────────────────────────────

test("isFrozenDay congela todo lo fechado hasta el último cierre inclusive", () => {
  assert.equal(isFrozenDay("2026-09-05", "2026-09-06"), true);
  assert.equal(isFrozenDay("2026-09-06", "2026-09-06"), true);
  assert.equal(isFrozenDay("2026-09-07", "2026-09-06"), false);
  assert.equal(isFrozenDay("2026-09-05", null), false);
  assert.ok(frozenDayMessage("2026-09-05", "2026-09-06").includes("06/09/2026"));
});

// El callejón que encontró el QA: se cierra hoy, aparece un gasto, y el mensaje mandaba a
// "cargalo con la fecha de hoy" — el día que se acaba de congelar. Tiene que nombrar el
// primer día ABIERTO, con fecha exacta.
test("el mensaje del día congelado manda al primer día abierto, no a hoy", () => {
  const m = frozenDayMessage("2026-09-07", "2026-09-07");
  assert.ok(m.includes("08/09/2026"), `no nombra el primer día abierto: ${m}`);
  assert.ok(!m.includes("fecha de hoy"), `sigue mandando a 'hoy': ${m}`);
  assert.ok(m.includes("ya está cerrado"));
});

test("un día absorbido por un cierre posterior lo dice con esas palabras, no 'ya está cerrado'", () => {
  const m = frozenDayMessage("2026-09-05", "2026-09-07");
  assert.ok(m.includes("quedó dentro del cierre del 07/09/2026"), m);
  assert.ok(m.includes("08/09/2026"));
});

test("no se puede cerrar un día ya cerrado ni un día que todavía no pasó", () => {
  const base = { previous: [], movements: [], declared: declared(0) };
  const cerrado = validateCierre(buildCierreDiario({ ...base, day: "2026-09-05" }), {
    note: "",
    today: "2026-09-06",
    lastClosedDay: "2026-09-05",
  });
  assert.equal(cerrado.ok, false);
  assert.ok(!cerrado.ok && cerrado.errors.some((e) => e.includes("ya está cerrado")));

  const futuro = validateCierre(buildCierreDiario({ ...base, day: "2026-09-07" }), {
    note: "",
    today: "2026-09-06",
    lastClosedDay: null,
  });
  assert.equal(futuro.ok, false);
  assert.ok(!futuro.ok && futuro.errors.some((e) => e.includes("todavía no pasó")));

  const hoy = validateCierre(buildCierreDiario({ ...base, day: "2026-09-06" }), {
    note: "",
    today: "2026-09-06",
    lastClosedDay: "2026-09-05",
  });
  assert.equal(hoy.ok, true);
});

test("validateCierre devuelve todos los errores juntos y rechaza una fecha inválida", () => {
  const c = buildCierreDiario({ day: "2026-02-30", previous: [], movements: [], declared: declared(null, -1) });
  const v = validateCierre(c, { note: "", today: "2026-09-06", lastClosedDay: null });
  assert.equal(v.ok, false);
  assert.ok(!v.ok && v.errors.length >= 3); // fecha inválida + falta efectivo + MP negativo
});

// ── Blindaje del dato ───────────────────────────────────────────────────────

test("un declarado no numérico (NaN) se trata como no declarado y la validación lo pide", () => {
  const c = buildCierreDiario({ day: "2026-09-06", previous: [], movements: [], declared: declared(Number.NaN) });
  assert.equal(c.porMedio.EFECTIVO.declared, null);
  assert.equal(c.estado, "SIN_DECLARAR");
  const v = validateCierre(c, { note: "", today: "2026-09-06", lastClosedDay: null });
  assert.equal(v.ok, false);
});

test("un movimiento con monto no usable no mueve el esperado (mismo blindaje que el libro)", () => {
  const c = buildCierreDiario({
    day: "2026-09-06",
    previous: [],
    movements: [mov({ id: "a", amount: 0 }), mov({ id: "b", amount: -50 }), mov({ id: "c", amount: 100, collectionId: "x", collectionOrigin: "RECEIVABLE" })],
    declared: declared(100),
  });
  assert.equal(c.movementCount, 3);
  assert.equal(c.porMedio.EFECTIVO.expected, 100);
  assert.equal(c.cobrosCarteraCount, 1);
  assert.equal(c.estado, "CUADRA");
});

// ── Utilidades de día ───────────────────────────────────────────────────────

test("isDayKey acepta fechas reales y rechaza el resto", () => {
  assert.equal(isDayKey("2026-09-06"), true);
  assert.equal(isDayKey("2026-02-29"), false); // 2026 no es bisiesto
  assert.equal(isDayKey("2024-02-29"), true);
  assert.equal(isDayKey("2026-13-01"), false);
  assert.equal(isDayKey("2026-9-6"), false);
  assert.equal(isDayKey(""), false);
  assert.equal(isDayKey(null), false);
});

test("compareDayKeys, nextDayKey y formatDayLabel", () => {
  assert.equal(compareDayKeys("2026-09-05", "2026-09-06"), -1);
  assert.equal(compareDayKeys("2026-09-06", "2026-09-06"), 0);
  assert.equal(compareDayKeys("2026-10-01", "2026-09-30"), 1);
  assert.equal(nextDayKey("2026-09-30"), "2026-10-01");
  assert.equal(nextDayKey("2026-12-31"), "2027-01-01");
  assert.equal(nextDayKey("2024-02-28"), "2024-02-29");
  assert.equal(formatDayLabel("2026-09-06"), "06/09/2026");
});

test("ajustesAsMovements produce filas válidas del libro (LibroMovement) con ids estables", () => {
  const c = buildCierreDiario({ day: "2026-09-06", previous: [], movements: [], declared: declared(10, 0) });
  const at = new Date("2026-09-06T23:59:00.000Z");
  const rows: LibroMovement[] = ajustesAsMovements(c, at);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "ajuste-2026-09-06-0");
  assert.equal(rows[0].occurredAt, at);
  assert.equal(rows[0].type, "INGRESO");
  assert.equal(rows[0].amount, 10);
  assert.ok(rows[0].detail.startsWith("Diferencia de caja 06/09/2026"));
});
