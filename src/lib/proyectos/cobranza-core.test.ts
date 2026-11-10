import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cobranza, cobranzaEnMoneda, conciliarConCobros, esPrevista, leerOriginal, lugarParaCobroManual, montoEnCashflow, pagadoDeCuota, pasaElTope, pendientesDeCobro, repartoDeCobros, repartoDelNegocio, resumenConCobranza, SIN_PREVISTAS_SIN_MARCAR, textoPagado, totalAprobado, type Cobranza, type CobroRegistrado } from "./cobranza-core";
import { aPesos, cashflowDelEvento, enMonedaDeVenta, resumenCuotas, type CuotaLeida } from "./gestion-core";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const HOY = new Date("2026-11-10T12:00:00Z");
const dias = (n: number) => new Date(HOY.getTime() + n * 86_400_000);
const TC = { USD: 1000 };

test("totalAprobado: precio fijo en pesos, recargo del ítem, recargo general y costo en dólares, más IVA", () => {
  const items = [
    { cantidad: 2, costo: 0, precio: 1000, moneda: "ARS", recargoPct: null }, // 2000
    { cantidad: 1, costo: 1000, precio: 0, moneda: "ARS", recargoPct: 50 }, // 1500
    { cantidad: 1, costo: 1000, precio: 0, moneda: "ARS", recargoPct: null }, // 1350 con 35 % general
    { cantidad: 1, costo: 1, precio: 0, moneda: "USD", recargoPct: 0 }, // 1000
  ];
  assert.equal(totalAprobado({ ivaPct: 21, items }, TC, 35), 7078.5); // 5850 + 21 %
  assert.equal(totalAprobado(null, TC, 35), 0);
});

test("cobranza: sólo cuentan los cobros no anulados; saldo y por cobrar", () => {
  const c = cobranza(90_912_140, [{ monto: 45_456_070 }, { monto: 10_000, anuladoEl: HOY }]);
  assert.deepEqual(c, { total: 90_912_140, cobrado: 45_456_070, saldo: 45_456_070, porCobrar: 45_456_070, avancePct: 50, sueltos: 45_456_070 });
});

test("cobranza: cobrado de más deja saldo negativo, por cobrar 0 y avance 100", () => {
  const c = cobranza(1000, [{ monto: 1200 }]);
  assert.equal(c.saldo, -200);
  assert.equal(c.porCobrar, 0);
  assert.equal(c.avancePct, 100);
});

test("cobranza: sin presupuesto aprobado no hay nada por cobrar", () => {
  assert.deepEqual(cobranza(0, []), { total: 0, cobrado: 0, saldo: 0, porCobrar: 0, avancePct: 0, sueltos: 0 });
});

// El caso del QA (proyecto 2026-004): el anticipo quedó marcado pago sin cobro registrado; el saldo se cobró en Finanzas.
const cuotasQA = [
  { proyectoId: "p4", tipo: "COBRO", monto: 45_456_070, moneda: "ARS", venceEl: dias(-40), pagadoEl: dias(-40) },
  { proyectoId: "p4", tipo: "COBRO", monto: 45_456_070, moneda: "ARS", venceEl: dias(-5), pagadoEl: dias(-1) },
];

test("conciliarConCobros: Estado financiero ya no dice 100 % cobrado si falta un cobro", () => {
  const crudo = resumenCuotas(cuotasQA, TC, HOY);
  assert.equal(crudo.aCobrar, 0); // lo que mostraba antes
  const r = conciliarConCobros(cuotasQA, TC, cobranza(90_912_140, [{ monto: 45_456_070 }]), HOY);
  assert.equal(r.cobrado, 45_456_070);
  assert.equal(r.aCobrar, 45_456_070);
});

test("conciliarConCobros: lo cobrado por fuera se descuenta de las cuotas más viejas; vencido + 7 días ≤ por cobrar", () => {
  const cuotas = [
    { tipo: "COBRO", monto: 600, moneda: "ARS", venceEl: dias(-3), pagadoEl: null },
    { tipo: "COBRO", monto: 400, moneda: "ARS", venceEl: dias(3), pagadoEl: null },
    { tipo: "PAGO", monto: 300, moneda: "ARS", venceEl: dias(-3), pagadoEl: null },
  ];
  // Se cobraron 700 por fuera de las cuotas: cubren la vencida (600) y 100 de la siguiente; faltan 300.
  const r = conciliarConCobros(cuotas, TC, cobranza(1000, [{ monto: 700 }]), HOY);
  assert.equal(r.aCobrar, 300);
  assert.equal(r.cobrosVencidos, 0);
  assert.equal(r.aCobrar7, 300);
  assert.equal(r.cantCobrosVencidos, 0);
  assert.equal(r.aPagar, 300); // los pagos a proveedores no se tocan
  assert.deepEqual(pendientesDeCobro(cuotas, TC, cobranza(1000, [{ monto: 700 }])), [0, 300, 300]);
  const saldado = conciliarConCobros(cuotas, TC, cobranza(1000, [{ monto: 1000 }]), HOY);
  assert.equal(saldado.cobrosVencidos, 0);
  assert.equal(saldado.cantCobrosVencidos, 0);
});

test("resumenConCobranza: el total del negocio es la suma de los por cobrar, más las cuotas de la empresa", () => {
  const cobranzas = new Map([
    ["p4", cobranza(90_912_140, [{ monto: 45_456_070 }])],
    ["p5", cobranza(45_949_750, [{ monto: 22_974_875 }])],
    ["p2", cobranza(6_086_300, [{ monto: 3_043_150 }])], // aprobado y con cobros, sin cuotas: se debe igual
  ]);
  const cuotas = [
    ...cuotasQA,
    { proyectoId: "p5", tipo: "COBRO", monto: 22_974_875, moneda: "ARS", venceEl: dias(-20), pagadoEl: dias(-20) },
    { proyectoId: "p5", tipo: "COBRO", monto: 22_974_875, moneda: "ARS", venceEl: dias(10), pagadoEl: null },
    { proyectoId: null, tipo: "COBRO", monto: 1000, moneda: "ARS", venceEl: dias(2), pagadoEl: null }, // de la empresa
    { proyectoId: null, tipo: "PAGO", monto: 500, moneda: "ARS", venceEl: dias(-1), pagadoEl: null },
  ];
  const r = resumenConCobranza(cuotas, TC, cobranzas, HOY);
  const porCobrarProyectos = [...cobranzas.values()].reduce((s, c) => s + c.porCobrar, 0);
  assert.equal(r.aCobrar, porCobrarProyectos + 1000);
  assert.equal(r.cobrado, 45_456_070 + 22_974_875 + 3_043_150);
  assert.equal(r.aCobrar7, 1000);
  assert.equal(r.aPagar, 500);
  assert.equal(r.cantPagosVencidos, 1);
});

// ── Certificación de 41fb9fb (adversariales) ────────────────────────────────

// A1: venta en USD a 1000 ($10M = USD 10.000), el cliente paga sus dólares con el dólar en otro valor.
const VENTA_USD = { moneda: "USD", cambioVenta: 1000 };
const totalUsd = totalAprobado({ ivaPct: 0, items: [{ cantidad: 1, costo: 0, precio: 10_000_000, moneda: "ARS", recargoPct: null }] }, {}, 30);

for (const dolar of [800, 1200]) {
  test(`A1 USD con dólar a ${dolar}: pagó los USD 10.000 completos y no debe nada (ni de más ni de menos)`, () => {
    const tc = { USD: dolar };
    const cuota = enMonedaDeVenta(totalUsd, 1000) / 2; // dos cuotas de USD 5000
    // Como `marcarCuota`: asienta los pesos del día y el enlace guarda lo pagado en dólares.
    const cobro = { monto: aPesos(cuota, "USD", tc), original: { monto: cuota, moneda: "USD" } };
    const c = cobranzaEnMoneda(totalUsd, [cobro, cobro], { ...VENTA_USD, tcHoy: dolar });
    assert.equal(c.saldo, 0);
    assert.equal(c.porCobrar, 0);
    assert.equal(c.avancePct, 100);
    assert.deepEqual(c.enMoneda, { moneda: "USD", tc: dolar, total: 10_000, cobrado: 10_000, saldo: 0 });
  });

  test(`A1 USD con dólar a ${dolar}: pagó la mitad; debe USD 5000 al cambio de hoy, también en el resumen`, () => {
    const tc = { USD: dolar };
    const cobro = { monto: aPesos(5000, "USD", tc), original: { monto: 5000, moneda: "USD" } };
    const c = cobranzaEnMoneda(totalUsd, [cobro], { ...VENTA_USD, tcHoy: dolar });
    assert.equal(c.porCobrar, 5000 * dolar);
    assert.equal(c.total, 10_000 * dolar);
    const cuotas = [
      { proyectoId: "p", tipo: "COBRO", monto: 5000, moneda: "USD", venceEl: dias(-10), pagadoEl: dias(-9) },
      { proyectoId: "p", tipo: "COBRO", monto: 5000, moneda: "USD", venceEl: dias(-1), pagadoEl: null },
    ];
    const r = resumenConCobranza(cuotas, tc, new Map([["p", c]]), HOY);
    assert.equal(r.aCobrar, 5000 * dolar);
    assert.equal(r.cobrosVencidos, 5000 * dolar);
  });
}

test("A1 USD: un cobro suelto en pesos se pasa a dólares con el cambio de hoy; sin cambio, cuenta en pesos como antes", () => {
  const c = cobranzaEnMoneda(totalUsd, [{ monto: 1_200_000 }], { ...VENTA_USD, tcHoy: 1200 });
  assert.equal(c.enMoneda?.cobrado, 1000);
  assert.equal(c.porCobrar, 9000 * 1200);
  assert.deepEqual(cobranzaEnMoneda(1000, [{ monto: 400 }], { ...VENTA_USD, tcHoy: 0 }), cobranza(1000, [{ monto: 400 }]));
  assert.deepEqual(cobranzaEnMoneda(1000, [{ monto: 400 }], { moneda: "ARS", cambioVenta: 1, tcHoy: 0 }), cobranza(1000, [{ monto: 400 }]));
});

test("leerOriginal: lee «5000 USD» del enlace; cualquier otra cosa, nada", () => {
  assert.deepEqual(leerOriginal("5000 USD"), { monto: 5000, moneda: "USD" });
  assert.deepEqual(leerOriginal("1234.56 USD"), { monto: 1234.56, moneda: "USD" });
  assert.equal(leerOriginal(null), null);
  assert.equal(leerOriginal("Pendiente"), null);
});

test("A3: vencido + próximos 7 días nunca suman más que lo que falta cobrar", () => {
  const cuotas = [
    { tipo: "COBRO", monto: 100, moneda: "ARS", venceEl: dias(-2), pagadoEl: null },
    { tipo: "COBRO", monto: 100, moneda: "ARS", venceEl: dias(3), pagadoEl: null },
  ];
  const r = conciliarConCobros(cuotas, TC, cobranza(200, [{ monto: 100 }]), HOY);
  assert.equal(r.aCobrar, 100);
  assert.ok(r.cobrosVencidos + r.aCobrar7 <= r.aCobrar);
  // Las cuotas no cierran con lo aprobado (suman 200 de 300): los 200 sueltos las cubren a las dos; los 100 que faltan
  // se deben (por cobrar) pero no tienen fecha en ninguna cuota (cert. v2, M1: se reparte lo entrado, no la diferencia).
  const raro = conciliarConCobros(cuotas, TC, cobranza(300, [{ monto: 200 }]), HOY);
  assert.equal(raro.aCobrar, 100);
  assert.equal(raro.cobrosVencidos, 0);
  assert.equal(raro.aCobrar7, 0);
});

test("QA 2026-004: un cobro manual de $10M baja el renglón del saldo a $35.456.070 y el renglón suma igual que el total", () => {
  const cuotas = [
    { id: "ant", proyectoId: "p4", tipo: "COBRO", monto: 45_456_070, moneda: "ARS", venceEl: dias(-40), pagadoEl: dias(-40) },
    { id: "sal", proyectoId: "p4", tipo: "COBRO", monto: 45_456_070, moneda: "ARS", venceEl: dias(-5), pagadoEl: null },
    { id: "otro", proyectoId: null, tipo: "COBRO", monto: 1000, moneda: "ARS", venceEl: dias(2), pagadoEl: null },
  ];
  const cob = cobranza(90_912_140, [{ monto: 45_456_070 }, { monto: 10_000_000 }]);
  assert.equal(cob.porCobrar, 35_456_070);
  const pend = repartoDelNegocio(cuotas, TC, new Map([["p4", cob]])).pendiente;
  assert.deepEqual(pend, [0, 35_456_070, 1000]);
  const r = resumenConCobranza(cuotas, TC, new Map([["p4", cob]]), HOY);
  assert.equal(r.aCobrar, 35_456_070 + 1000);
  assert.equal(r.cobrosVencidos, 35_456_070);
  // «Marcar cobrado» cobra lo que falta: después, nada por cobrar ni renglones pendientes.
  const despues = cobranza(90_912_140, [{ monto: 45_456_070 }, { monto: 10_000_000 }, { monto: pend[1] }]);
  assert.equal(despues.porCobrar, 0);
  // Un cobro manual que cubre toda la cuota la deja en cero (cubierta).
  assert.deepEqual(pendientesDeCobro(cuotas.slice(0, 2), TC, cobranza(90_912_140, [{ monto: 90_912_140 }])), [0, 0]);
});

test("pendientesDeCobro: sin presupuesto aprobado las cuotas valen lo que dicen; en dólares el descuento queda en dólares", () => {
  const cuotas = [{ tipo: "COBRO", monto: 500, moneda: "ARS", venceEl: dias(1), pagadoEl: null }];
  assert.deepEqual(pendientesDeCobro(cuotas, TC, cobranza(0, [{ monto: 100 }])), [500]);
  const usd = [
    { tipo: "COBRO", monto: 5000, moneda: "USD", venceEl: dias(-1), pagadoEl: null },
    { tipo: "COBRO", monto: 5000, moneda: "USD", venceEl: dias(9), pagadoEl: null },
  ];
  // Total USD 10.000, cobró $1.200.000 sueltos con el dólar a 1200 (USD 1000): la cuota vieja queda en USD 4000.
  const c = cobranzaEnMoneda(totalUsd, [{ monto: 1_200_000 }], { ...VENTA_USD, tcHoy: 1200 });
  assert.deepEqual(pendientesDeCobro(usd, { USD: 1200 }, c), [4000, 5000]);
});


// ── Adversarial v2 (tal cual; #3 y #4 «Carrera», al final: candado + relectura en la transacción) ──────────────────

const q = (monto: number, d: number, extra: Record<string, unknown> = {}) => ({ tipo: "COBRO", monto, moneda: "ARS", venceEl: dias(d), pagadoEl: null as Date | null, ...extra });

test("v2 #1 A1: USD pagado completo por enlace, con el dólar a 800, 1000 o 1500: saldo 0", () => {
  for (const tcHoy of [800, 1000, 1500]) {
    const c = cobranzaEnMoneda(10_000_000, [{ monto: 5000 * 900, original: { monto: 5000, moneda: "USD" } }, { monto: 5000 * tcHoy, original: { monto: 5000, moneda: "USD" } }], { moneda: "USD", cambioVenta: 1000, tcHoy });
    assert.equal(c.porCobrar, 0, `tc ${tcHoy}`);
  }
});

test("v2 #2 A3: vencido + 7 días nunca pasan lo que falta cobrar", () => {
  const c = cobranza(1500, [{ monto: 0 }]);
  const r = conciliarConCobros([q(1000, -5), q(1000, 3)], {}, c, HOY);
  assert.ok(r.cobrosVencidos + r.aCobrar7 <= c.porCobrar + 0.001, JSON.stringify(r));
});

test("v2 #5: una cuota de cobro cargada a mano que pasa lo que falta no baja la vieja (se recorta la más nueva)", () => {
  const c = cobranza(2000, []);
  assert.ok(500 <= c.porCobrar);
  const pend = pendientesDeCobro([q(1000, -5), q(1000, 10), q(500, 20)], {}, c);
  assert.equal(pend[0], 1000, "nadie pagó nada y «Marcar cobrado» de la cuota vieja cobraría " + pend[0]);
  for (const manual of [500, 1000, 1500]) assert.deepEqual(pendientesDeCobro([q(1000, -5), q(1000, 10), q(manual, 20)], {}, c), [1000, 1000, 0], `manual ${manual}`);
});

test("v2 #6 (D-b): aprobado menor que las cuotas (dólar a la baja): la vieja entera, la nueva recortada → [600.000, 400.000]", () => {
  const pend = pendientesDeCobro([q(600_000, -5), q(600_000, 10)], {}, cobranza(1_000_000, []));
  assert.equal(pend[0], 600_000, "cuota vieja recortada a " + pend[0]);
  assert.deepEqual(pend, [600_000, 400_000]);
});

test("v2 #7 leerOriginal: sólo «monto MONEDA» exacto", () => {
  assert.deepEqual(leerOriginal("5000 USD"), { monto: 5000, moneda: "USD" });
  assert.deepEqual(leerOriginal("1234.56 USD"), { monto: 1234.56, moneda: "USD" });
  assert.deepEqual(leerOriginal("60.00 USD"), { monto: 60, moneda: "USD" }); // lo que graba marcarCuota (toFixed(2))
  for (const raro of ["-5000 USD", "5000 USD\n", "5000 usd", " 5000 USD", `${1e21} USD`, `${5e-7} USD`, "Infinity USD", null]) assert.equal(leerOriginal(raro), null, String(raro));
});

test("v2 #8: USD sin cambio de hoy cuenta en pesos, sin NaN", () => {
  const c = cobranzaEnMoneda(1_000_000, [{ monto: 500_000, original: { monto: 500, moneda: "USD" } }], { moneda: "USD", cambioVenta: 1000, tcHoy: 0 });
  assert.equal(c.porCobrar, 500_000);
  assert.ok(!c.enMoneda);
  assert.ok(Number.isFinite(cobranzaEnMoneda(1_000_000, [{ monto: 500_000 }], { moneda: "USD", cambioVenta: NaN, tcHoy: 1000 }).porCobrar));
});

test("v2 #9: cobrado de más en USD deja por cobrar 0 y el negocio no resta", () => {
  const c1 = cobranzaEnMoneda(1_000_000, [{ monto: 0, original: { monto: 1500, moneda: "USD" } }], { moneda: "USD", cambioVenta: 1000, tcHoy: 1200 });
  assert.equal(c1.porCobrar, 0);
  assert.ok(c1.saldo < 0);
  const r = resumenConCobranza([{ ...q(1000, -1), proyectoId: "b" }], {}, new Map([["a", c1], ["b", cobranza(1000, [])]]), HOY);
  assert.equal(r.aCobrar, 1000);
});

test("v2 #10: tres cuotas USD 3333,33 / 3333,33 / 3333,34 cierran en saldo 0", () => {
  const cob = [3333.33, 3333.33, 3333.34].map((m) => ({ monto: aPesos(m, "USD", { USD: 1200 }), original: { monto: m, moneda: "USD" } }));
  assert.equal(cobranzaEnMoneda(10_000 * 1137.5, cob, { moneda: "USD", cambioVenta: 1137.5, tcHoy: 1450.37 }).porCobrar, 0);
});

test("v2 #11: USD con cobro suelto en pesos y la cuota marcada por lo que faltaba: la siguiente queda entera", () => {
  const tc = { USD: 1000 };
  const cuotas = [{ ...q(5000, -5), moneda: "USD" }, { ...q(5000, 10), moneda: "USD" }];
  const v = { moneda: "USD", cambioVenta: 1000, tcHoy: 1000 };
  const pend = pendientesDeCobro(cuotas, tc, cobranzaEnMoneda(10_000_000, [{ monto: 2_000_000 }], v));
  assert.equal(pend[0], 3000);
  const c1 = cobranzaEnMoneda(10_000_000, [{ monto: 2_000_000 }, { monto: aPesos(pend[0], "USD", tc), original: { monto: pend[0], moneda: "USD" } }], v);
  assert.equal(pendientesDeCobro([{ ...cuotas[0], pagadoEl: dias(0) }, cuotas[1]], tc, c1)[1], 5000);
});

test("v2: tope de la cuota manual = por cobrar − lo que las cuotas pendientes ya esperan (nunca negativo)", () => {
  const cuotas = [q(1000, -5), q(1000, 10)];
  assert.deepEqual(lugarParaCobroManual(cuotas, {}, cobranza(2000, [])), { lugar: 0, esperado: 2000 });
  assert.deepEqual(lugarParaCobroManual(cuotas, {}, cobranza(2500, [])), { lugar: 500, esperado: 2000 });
  // 300 sueltos cubren parte de la vieja: lo esperado baja a 1700 y lo que falta a 2200.
  assert.deepEqual(lugarParaCobroManual(cuotas, {}, cobranza(2500, [{ monto: 300 }])), { lugar: 500, esperado: 1700 });
  assert.deepEqual(lugarParaCobroManual([q(600_000, -5), q(600_000, 10)], {}, cobranza(1_000_000, [])), { lugar: 0, esperado: 1_000_000 });
  assert.equal(lugarParaCobroManual(cuotas, {}, cobranza(0, [])).lugar, Infinity);
});

test("v2: marcada en parte con plata suelta (enlace con id): lo suelto no se vuelve a descontar de la siguiente", () => {
  const cuotas = [q(1000, -5, { id: "a" }), q(1000, 10, { id: "b" })];
  assert.deepEqual(pendientesDeCobro(cuotas, {}, cobranza(2000, [{ monto: 400 }])), [600, 1000]);
  const c = cobranza(2000, [{ monto: 400 }, { monto: 600, cuotaId: "a" }]);
  const r = repartoDeCobros([{ ...cuotas[0], pagadoEl: dias(0) }, cuotas[1]], {}, c);
  assert.deepEqual(r, { pendiente: [0, 1000], cobrado: [1000, 0] });
  assert.equal(c.porCobrar, 1000);
});

test("v2: lo cobrado por cuota es lo que entró (enlace + parte de lo suelto), no el monto de la cuota", () => {
  assert.deepEqual(repartoDeCobros([q(1000, -5, { id: "a", pagadoEl: dias(-1) })], {}, cobranza(1000, [])).cobrado, [0]);
  const usd = [{ ...q(5000, -5, { id: "u", pagadoEl: dias(-1) }), moneda: "USD" }, { ...q(5000, 10, { id: "v" }), moneda: "USD" }];
  const c = cobranzaEnMoneda(10_000_000, [{ monto: 2_000_000 }, { monto: 3_000_000, original: { monto: 3000, moneda: "USD" }, cuotaId: "u" }], { moneda: "USD", cambioVenta: 1000, tcHoy: 1000 });
  assert.deepEqual(repartoDeCobros(usd, { USD: 1000 }, c), { pendiente: [0, 5000], cobrado: [5000, 0] });
  assert.deepEqual(repartoDelNegocio([{ ...q(700, -1, { pagadoEl: dias(-1) }), proyectoId: null }], {}, new Map()), { pendiente: [0], cobrado: [700] });
});

// ── Adversarial v3 (tal cual) ───────────────────────────────────────────────

const qi = (id: string, monto: number, d: number, extra: Record<string, unknown> = {}) => ({ id, tipo: "COBRO", monto, moneda: "ARS", venceEl: dias(d), pagadoEl: null as Date | null, anuladoEl: null, ...extra });
const sumaPend = (cuotas: readonly CuotaLeida[], p: number[], tc: Record<string, number>) => p.reduce((s, x, i) => s + aPesos(x, cuotas[i].moneda, tc), 0);

test("V3-1 ARS + cuota USD parcial: lo suelto no se cuenta dos veces", () => {
  const tc = { USD: 1000 };
  const U = qi("U", 100, -10, { moneda: "USD" });
  const B = qi("B", 100_000, 10);
  assert.deepEqual(pendientesDeCobro([U, B], tc, cobranza(200_000, [{ monto: 40_000 }])), [60, 100_000]);
  // Enlace sin original (el peor caso: el servidor de antes no lo leía en proyectos en pesos): vale pesos / tc[USD].
  const despues = cobranza(200_000, [{ monto: 40_000 }, { monto: 60_000, cuotaId: "U", original: null }]);
  const Um = { ...U, pagadoEl: dias(0) };
  const r = repartoDeCobros([Um, B], tc, despues);
  assert.equal(despues.porCobrar, 100_000);
  assert.equal(sumaPend([Um, B], r.pendiente, tc), despues.porCobrar, `U cobrado ${r.cobrado[0]} USD (entró 60)`);
  assert.equal(r.cobrado[0], 100);
});

test("V3-2 (D-b) cuotas > total: marcar todas no cobra más que lo aprobado → [500, 500, 0]", () => {
  const cuotas = [qi("A", 500, -10), qi("B", 500, 0), qi("M", 300, 5)];
  const c = cobranza(1000, []);
  const p = pendientesDeCobro(cuotas, {}, c);
  assert.ok(p.reduce((s, x) => s + x, 0) <= c.porCobrar + 0.01);
  assert.deepEqual(p, [500, 500, 0]);
});

test("V3-3 lugarParaCobroManual con cuotas que ya exceden: 0, no entra ninguna", () => {
  const { lugar } = lugarParaCobroManual([qi("A", 500, -10), qi("B", 500, 0), qi("M", 300, 5)], {}, cobranza(1000, []));
  assert.ok(lugar <= 0);
});

test("V3-4 USD con enlace + sueltos: pendientes == porCobrar", () => {
  const tc = { USD: 1000 };
  const A = qi("A", 5, -10, { moneda: "USD" }), B = qi("B", 5, 10, { moneda: "USD" });
  const v = { moneda: "USD", cambioVenta: 1000, tcHoy: 1000 };
  assert.deepEqual(pendientesDeCobro([A, B], tc, cobranzaEnMoneda(10_000, [{ monto: 2000 }], v)), [3, 5]);
  const c1 = cobranzaEnMoneda(10_000, [{ monto: 2000 }, { monto: 3000, cuotaId: "A", original: { monto: 3, moneda: "USD" } }], v);
  const Am = { ...A, pagadoEl: dias(0) };
  const r = repartoDeCobros([Am, B], tc, c1);
  assert.equal(sumaPend([Am, B], r.pendiente, tc), c1.porCobrar);
  assert.equal(r.cobrado[0], 5);
});

test("V3-5 enlazado no es suelto", () => {
  const c = cobranza(1000, [{ monto: 400, cuotaId: "A" }, { monto: 100 }]);
  assert.equal(c.sueltos, 100);
  assert.equal(c.deCuotas?.A.pesos, 400);
});

// ── D-d: huérfanos ──────────────────────────────────────────────────────────

test("D-d: un cobro enlazado a una cuota reabierta o anulada cuenta como suelto (se descuenta de la más vieja)", () => {
  // «A» se reabrió (pagadoEl null) con su cobro de 400 vivo; «X» se anuló con su cobro de 300 vivo.
  const cuotas = [qi("A", 1000, -5), qi("X", 500, -10, { anuladoEl: dias(-1), pagadoEl: dias(-6) }), qi("B", 1000, 10)];
  const c = cobranza(2000, [{ monto: 400, cuotaId: "A" }, { monto: 300, cuotaId: "X" }, { monto: 50, cuotaId: "fantasma" }]);
  const r = repartoDeCobros(cuotas, {}, c);
  assert.deepEqual(r.pendiente, [250, 0, 1000]);
  assert.deepEqual(r.cobrado, [750, 0, 0]);
  assert.equal(sumaPend(cuotas, r.pendiente, {}), c.porCobrar);
});

// ── D-c: I4, marcar en cadena hasta por cobrar 0 ────────────────────────────

/** Marca la pendiente más vieja por su pendiente, como `marcarCuota`: asienta sus pesos y, en otra moneda, el original. */
function marcarEnCadena(cuotas: CuotaLeida[], tc: Record<string, number>, cobrar: (cobros: CobroRegistrado[]) => Cobranza) {
  const cobros: CobroRegistrado[] = [];
  const pasos: number[] = [];
  for (let vuelta = 0; vuelta < cuotas.length; vuelta++) {
    const antes = cobrar(cobros);
    const pend = pendientesDeCobro(cuotas, tc, antes);
    const i = cuotas.map((_, k) => k).filter((k) => !cuotas[k].pagadoEl && pend[k] > 0).sort((a, b) => cuotas[a].venceEl.getTime() - cuotas[b].venceEl.getTime())[0];
    if (i === undefined) break;
    const importe = aPesos(pend[i], cuotas[i].moneda, tc);
    assert.equal(pasaElTope(antes, importe), false, `marcar ${cuotas[i].id} por ${importe} pasa el tope ${antes.porCobrar}`);
    cobros.push({ monto: importe, cuotaId: cuotas[i].id, original: cuotas[i].moneda !== "ARS" ? { monto: pend[i], moneda: cuotas[i].moneda } : null });
    cuotas[i] = { ...cuotas[i], pagadoEl: HOY };
    const despues = cobrar(cobros);
    assert.ok(Math.abs(antes.porCobrar - despues.porCobrar - importe) <= 0.01, `I4: porCobrar ${antes.porCobrar} → ${despues.porCobrar}, marcó ${importe}`);
    pasos.push(importe);
  }
  return { final: cobrar(cobros), pasos };
}

test("D-c I4: proyecto en pesos con una cuota en USD, más un suelto: marcar en cadena deja por cobrar 0", () => {
  const tc = { USD: 1000 };
  const cuotas = [qi("U", 300, -20, { moneda: "USD" }), qi("A", 400_000, -5), qi("B", 500_000, 10)];
  const { final, pasos } = marcarEnCadena(cuotas, tc, (cs) => cobranza(1_000_000, [{ monto: 120_000 }, ...cs]));
  assert.equal(final.porCobrar, 0);
  assert.deepEqual(pasos, [180_000, 400_000, 300_000]); // U: 300 − 120 USD; B recortada al tope (880.000 − 580.000)
});

test("D-c I4: proyecto en USD con una cuota en pesos: marcar en cadena deja por cobrar 0", () => {
  const tc = { USD: 1000 };
  const v = { moneda: "USD", cambioVenta: 1000, tcHoy: 1000 };
  const cuotas = [qi("A", 2_000_000, -20), qi("U", 5000, -5, { moneda: "USD" }), qi("V", 5000, 10, { moneda: "USD" })];
  const { final, pasos } = marcarEnCadena(cuotas, tc, (cs) => cobranzaEnMoneda(10_000_000, [{ monto: 500_000 }, ...cs], v));
  assert.equal(final.porCobrar, 0);
  assert.deepEqual(pasos, [1_500_000, 5_000_000, 3_000_000]);
});

// ── D-a: propiedades I1, I2, I3, I5 y D-e (cashflow) con 500 casos de semilla fija ──────────────────────────────

function azar(semilla: number) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { r, entre: (min: number, max: number) => min + Math.floor(r() * (max - min + 1)), uno: <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] };
}

interface Caso {
  moneda: string;
  tc: Record<string, number>;
  totalPesos: number;
  cambioVenta: number;
  cuotas: (CuotaLeida & { id: string })[];
  cobros: CobroRegistrado[];
}

function generarCaso(semilla: number): Caso {
  const { r, entre, uno } = azar(semilla);
  const moneda = r() < 0.6 ? "ARS" : "USD";
  const tcUsd = uno([800, 1000, 1234.5]);
  const tc = { USD: tcUsd };
  const cambioVenta = moneda === "ARS" ? 1 : uno([900, 1000, 1100]);
  const totalPesos = r() < 0.08 ? 0 : entre(50, 3000) * 1000;
  const cuotas: Caso["cuotas"] = [];
  for (let k = 0, n = entre(1, 5); k < n; k++) {
    const enUsd = r() < 0.4;
    const monto = enUsd ? entre(10, 1500) + entre(0, 99) / 100 : entre(10, 1500) * 1000 + entre(0, 99) / 100;
    const estado = r();
    cuotas.push({ id: `c${k}`, tipo: r() < 0.9 ? "COBRO" : "PAGO", monto, moneda: enUsd ? "USD" : "ARS", venceEl: dias(entre(-40, 40)), pagadoEl: estado < 0.35 ? dias(-1) : null, anuladoEl: estado > 0.9 ? dias(-2) : null });
  }
  const cobros: CobroRegistrado[] = [];
  for (let k = 0, n = entre(0, 5); k < n; k++) {
    const tipo = r();
    const anuladoEl = r() < 0.1 ? dias(-1) : null;
    if (tipo < 0.4) {
      cobros.push({ monto: entre(1, 800) * 1000, anuladoEl }); // suelto
    } else {
      const cu = uno(cuotas);
      const enlazado = tipo < 0.85 ? cu.id : `perdida${k}`; // cuota del caso (marcada o no: huérfano) o una que no está
      const orig = cu.moneda === "USD" ? Math.round(cu.monto * (0.2 + r()) * 100) / 100 : null;
      const pesos = orig !== null ? aPesos(orig, "USD", tc) : Math.round(cu.monto * (0.2 + r()) * 100) / 100;
      cobros.push({ monto: pesos, cuotaId: enlazado, original: orig !== null && r() < 0.7 ? { monto: orig, moneda: "USD" } : null, anuladoEl });
    }
  }
  return { moneda, tc, totalPesos, cambioVenta, cuotas, cobros };
}

const cobranzaDelCaso = (k: Caso, cobros = k.cobros) => cobranzaEnMoneda(k.totalPesos, cobros, { moneda: k.moneda, cambioVenta: k.cambioVenta, tcHoy: k.tc.USD });
const vivaDeCobro = (q: CuotaLeida) => q.tipo === "COBRO" && !q.anuladoEl;
/**
 * El redondeo al centavo de cada cuota (y, en un proyecto en USD, del saldo en USD) pasado a pesos: lo cobrado de una cuota
 * en USD se pasa a su moneda al centavo PARA ABAJO (V4-1: así una línea del cashflow nunca supera lo que entró), hasta un
 * centavo × tc por cuota.
 */
const tolerancia = (k: Caso) => 0.01 + (k.moneda === "ARS" ? 0 : 0.012 * k.tc.USD) + k.cuotas.reduce((s, q) => s + (q.moneda === "ARS" ? 0.01 : 0.011 * k.tc.USD), 0);
const CASOS = Array.from({ length: 500 }, (_, i) => generarCaso(20261110 + i));

test("D-a I1: Σ pendientes (en pesos de hoy) ≤ por cobrar, en los 500 casos con aprobado", () => {
  let conTotal = 0;
  for (const [n, k] of CASOS.entries()) {
    const c = cobranzaDelCaso(k);
    if (!(c.total > 0)) continue;
    conTotal++;
    const pend = pendientesDeCobro(k.cuotas, k.tc, c);
    const suma = k.cuotas.reduce((s, q, i) => (vivaDeCobro(q) && !q.pagadoEl ? s + aPesos(pend[i], q.moneda, k.tc) : s), 0);
    assert.ok(suma <= c.porCobrar + 0.01 * k.cuotas.length, `caso ${n}: Σ pend ${suma} > porCobrar ${c.porCobrar}`);
    assert.ok(pend.every((x) => x >= 0), `caso ${n}: pendiente negativo`);
  }
  assert.ok(conTotal > 400);
});

test("D-a I3: cada peso cobrado se cuenta una vez; si sobra plata suelta, las cuotas quedaron completas", () => {
  for (const [n, k] of CASOS.entries()) {
    const c = cobranzaDelCaso(k);
    const { cobrado } = repartoDeCobros(k.cuotas, k.tc, c);
    const entro = k.cobros.reduce((s, x) => (x.anuladoEl ? s : s + x.monto), 0);
    const contado = k.cuotas.reduce((s, q, i) => (vivaDeCobro(q) ? s + aPesos(cobrado[i], q.moneda, k.tc) : s), 0);
    // Lo cobrado contra cuotas que no son del caso (o de cobros de otra cuota) es suelto; lo propio de una cuota no se repite.
    assert.ok(contado <= entro + tolerancia(k), `caso ${n}: se contaron ${contado} de ${entro}`);
    if (entro - contado > tolerancia(k)) {
      for (const [i, q] of k.cuotas.entries()) {
        if (!vivaDeCobro(q) || (!q.pagadoEl && !(c.total > 0))) continue;
        assert.ok(cobrado[i] >= q.monto - 0.01, `caso ${n}: sobró ${entro - contado} y la cuota ${q.id} quedó en ${cobrado[i]} de ${q.monto}`);
      }
    }
  }
});

test("D-a I2: sin cobros, la cuota de cobro más vieja conserva su monto (lo recortado es la cola)", () => {
  for (const [n, k] of CASOS.entries()) {
    const c = cobranzaDelCaso(k, []);
    const pend = pendientesDeCobro(k.cuotas, k.tc, c);
    const orden = k.cuotas.map((_, i) => i).filter((i) => vivaDeCobro(k.cuotas[i]) && !k.cuotas[i].pagadoEl).sort((a, b) => k.cuotas[a].venceEl.getTime() - k.cuotas[b].venceEl.getTime());
    if (orden.length === 0) continue;
    const vieja = orden[0];
    if (c.total > 0 && aPesos(k.cuotas[vieja].monto, k.cuotas[vieja].moneda, k.tc) > c.porCobrar) continue; // ni la vieja entra
    assert.equal(pend[vieja], k.cuotas[vieja].monto, `caso ${n}`);
    // Y de ahí para atrás, cada una toma lo que le queda del tope en orden: nunca una más nueva antes que una más vieja.
    let cola = false;
    for (const i of orden) {
      if (cola) assert.equal(pend[i], 0, `caso ${n}: ${k.cuotas[i].id} después del recorte`);
      else if (pend[i] < k.cuotas[i].monto) cola = true;
    }
  }
});

test("D-a I5: vencido + próximos 7 días ≤ por cobrar (consecuencia de I1), con aprobado", () => {
  for (const [n, k] of CASOS.entries()) {
    const c = cobranzaDelCaso(k);
    if (!(c.total > 0)) continue;
    const r = conciliarConCobros(k.cuotas, k.tc, c, HOY);
    assert.ok(r.cobrosVencidos + r.aCobrar7 <= c.porCobrar + 0.01 * k.cuotas.length, `caso ${n}: ${r.cobrosVencidos} + ${r.aCobrar7} > ${c.porCobrar}`);
  }
});

test("D-a I4: marcar la pendiente más vieja por su pendiente baja por cobrar exactamente eso (proyectos en pesos)", () => {
  let probados = 0;
  for (const [n, k] of CASOS.entries()) {
    if (k.moneda !== "ARS") continue;
    const c = cobranzaDelCaso(k);
    if (!(c.total > 0)) continue;
    const pend = pendientesDeCobro(k.cuotas, k.tc, c);
    const i = k.cuotas.map((_, j) => j).filter((j) => vivaDeCobro(k.cuotas[j]) && !k.cuotas[j].pagadoEl && pend[j] > 0).sort((a, b) => k.cuotas[a].venceEl.getTime() - k.cuotas[b].venceEl.getTime())[0];
    if (i === undefined) continue;
    probados++;
    const q = k.cuotas[i];
    const importe = aPesos(pend[i], q.moneda, k.tc);
    assert.equal(pasaElTope(c, importe), false, `caso ${n}`);
    const despues = cobranzaDelCaso(k, [...k.cobros, { monto: importe, cuotaId: q.id, original: q.moneda !== "ARS" ? { monto: pend[i], moneda: q.moneda } : null }]);
    assert.ok(Math.abs(c.porCobrar - despues.porCobrar - importe) <= 0.01, `caso ${n}: ${c.porCobrar} → ${despues.porCobrar} con ${importe}`);
  }
  assert.ok(probados > 100);
});

test("D-e: cashflow del evento: las líneas de cobro (lo que entró + lo que falta) no pasan del total aprobado", () => {
  for (const [n, k] of CASOS.entries()) {
    const c = cobranzaDelCaso(k);
    if (!(c.total > 0) || c.saldo < 0) continue;
    const reparto = repartoDeCobros(k.cuotas, k.tc, c);
    const conReparto = k.cuotas.map((q, i) => ({ ...q, pendiente: reparto.pendiente[i], cobrado: reparto.cobrado[i] }));
    const { lineas } = cashflowDelEvento(conReparto, k.tc, montoEnCashflow);
    const cobros = lineas.filter((l) => l.cuota.tipo === "COBRO").reduce((s, l) => s + l.importe, 0);
    assert.ok(cobros <= c.total + tolerancia(k), `caso ${n}: líneas de cobro ${cobros} > total ${c.total}`);
  }
  // Un pago a proveedor sigue con su monto; una cuota de cobro pagada, con lo que entró (no su monto).
  assert.equal(montoEnCashflow({ tipo: "PAGO", monto: 700, cobrado: 0, pendiente: 0 }), 700);
  assert.equal(montoEnCashflow({ tipo: "COBRO", monto: 700, cobrado: 400, pendiente: 0 }), 400);
});

// ── Certificación v4 ──────────────────────────────────────────────────────────────────────────────────────

/** Σ de las líneas de cobro del cashflow del evento, en pesos de hoy. */
const lineasDeCobro = (cuotas: readonly CuotaLeida[], tc: Record<string, number>, c: Cobranza) => {
  const r = repartoDeCobros(cuotas, tc, c);
  const { lineas } = cashflowDelEvento(cuotas.map((q, i) => ({ ...q, pendiente: r.pendiente[i], cobrado: r.cobrado[i] })), tc, montoEnCashflow);
  return { r, suma: lineas.filter((l) => l.cuota.tipo === "COBRO").reduce((s, l) => s + l.importe, 0) };
};

test("V4-1: proyecto en pesos, cuota USD marcada con el dólar a 1000; con el dólar a 1500, 500 o 1000 vale los pesos que entraron (Σ cobro ≤ total, I3 en H)", () => {
  const cuotas = [qi("U", 100, -10, { moneda: "USD", pagadoEl: dias(-10) }), qi("B", 100_000, 10)];
  const cobros: CobroRegistrado[] = [{ monto: 100_000, cuotaId: "U", original: { monto: 100, moneda: "USD" } }];
  for (const [dolar, enUsd] of [[1500, 66.66], [500, 200], [1000, 100]] as const) {
    const tc = { USD: dolar };
    const c = cobranza(200_000, cobros);
    const { r, suma } = lineasDeCobro(cuotas, tc, c);
    assert.equal(r.cobrado[0], enUsd, `dólar ${dolar}`); // 100.000 pesos en USD de hoy, al centavo para abajo
    assert.deepEqual(r.pendiente, [0, 100_000], `dólar ${dolar}: la cuota en USD sigue completa (se mide en su moneda)`);
    assert.ok(suma <= c.total + 0.01, `dólar ${dolar}: Σ cobro ${suma} > total ${c.total}`);
    // I3 en H: lo contado por la cuota marcada son los pesos que entraron (al centavo de USD × tc).
    assert.ok(Math.abs(aPesos(r.cobrado[0], "USD", tc) - 100_000) <= 0.01 * dolar, `dólar ${dolar}: I3`);
  }
  // Proyecto en USD con la cuota en USD: lo que pagó el cliente en dólares vale sus dólares (no los pesos de aquel día).
  const v = (dolar: number) => ({ moneda: "USD", cambioVenta: 1000, tcHoy: dolar });
  const cuotasUsd = [qi("U", 100, -10, { moneda: "USD", pagadoEl: dias(-10) }), qi("V", 100, 10, { moneda: "USD" })];
  for (const dolar of [1500, 500]) {
    const c = cobranzaEnMoneda(200_000, cobros, v(dolar));
    const { r, suma } = lineasDeCobro(cuotasUsd, { USD: dolar }, c);
    assert.deepEqual(r, { cobrado: [100, 0], pendiente: [0, 100] }, `dólar ${dolar}`);
    assert.ok(Math.abs(suma - c.total) <= 0.01, `dólar ${dolar}: Σ cobro ${suma} vs total ${c.total}`);
  }
});

const previstasV4 = () => [qi("A", 600, -30, { prevista: true }), qi("S", 400, -20, { prevista: true }), qi("M", 300, -5)];

test("V4-2: las previstas no entran al reparto: la cuota real vencida queda en 300 en la ficha, en «Marcar cobrado» y en Administración", () => {
  const c = cobranza(1000, []);
  const ficha = previstasV4();
  const pend = pendientesDeCobro(ficha, {}, c);
  assert.equal(pend[2], 300);
  assert.equal(pendientesDeCobro([ficha[2]], {}, c)[0], 300); // Administración: lee sin previstas
  // Las previstas se muestran con lo que les queda del tope, después de las reales: el cashflow no pasa del total.
  assert.deepEqual(pend, [600, 100, 300]);
  assert.ok(lineasDeCobro(ficha, {}, c).suma <= c.total + 0.01);
  // Vencido: sólo la real (las previstas no son plata todavía), igual en la ficha que en Administración.
  assert.equal(conciliarConCobros(ficha, {}, c, HOY).cobrosVencidos, 300);
  assert.equal(conciliarConCobros([ficha[2]], {}, c, HOY).cobrosVencidos, 300);
  assert.equal(resumenConCobranza(ficha.map((q) => ({ ...q, proyectoId: "p" })), {}, new Map([["p", c]]), HOY).cobrosVencidos, 300);
  // El lugar para una cuota manual no lo comen las previstas.
  assert.deepEqual(lugarParaCobroManual(ficha, {}, c), { lugar: 700, esperado: 300 });
  // Una prevista ya marcada es plata: cuenta como cualquier marcada.
  const marcada = [qi("A", 600, -30, { prevista: true, pagadoEl: dias(-30) }), qi("M", 300, -5)];
  assert.deepEqual(repartoDeCobros(marcada, {}, cobranza(1000, [{ monto: 600, cuotaId: "A" }])), { cobrado: [600, 0], pendiente: [0, 300] });
});

test("V4-3: proyecto en USD con cuota en EUR o en pesos: marcar baja por cobrar lo marcado ± 0,01 × tc del USD (declarado)", () => {
  const { r, entre, uno } = azar(4242);
  let peor = 0;
  for (let k = 0; k < 400; k++) {
    const tc = { USD: entre(800, 1700) + uno([0, 0.37]), EUR: 1100.13 };
    const v = { moneda: "USD", cambioVenta: tc.USD * (0.8 + r() * 0.4), tcHoy: tc.USD };
    const total = entre(100, 3000) * 1000 + 0.01;
    const moneda = uno(["EUR", "ARS"]);
    const cuota = qi("q", moneda === "ARS" ? entre(10, 1500) * 1000 + 0.33 : entre(1, 1500) + 0.01, -1, { moneda });
    const cobros: CobroRegistrado[] = r() < 0.5 ? [{ monto: entre(1, 50) * 1000 }] : [];
    const antes = cobranzaEnMoneda(total, cobros, v);
    const pend = pendientesDeCobro([cuota], tc, antes)[0];
    if (!(pend > 0)) continue;
    const importe = aPesos(pend, moneda, tc);
    const despues = cobranzaEnMoneda(total, [...cobros, { monto: importe, cuotaId: "q", original: moneda !== "ARS" ? { monto: pend, moneda } : null }], v);
    const desvio = Math.abs(antes.porCobrar - despues.porCobrar - importe);
    assert.ok(desvio <= 0.01 * tc.USD + 0.01, `k${k}: desvío ${desvio} > 0,01 × ${tc.USD}`);
    peor = Math.max(peor, desvio / tc.USD);
  }
  // Es real (no un error de la prueba): pasa del medio centavo de dólar, por el redondeo del cobrado en USD antes y después.
  assert.ok(peor > 0.005, `peor ${peor}`);
});

// ── Servidor con `db` falso: D-f (enlaces) y v2 #3/#4 (candado + relectura en la transacción) ──────────────────

type Fila = Record<string, unknown>;
/** Un `db` de Prisma falso: anota el orden de las llamadas y filtra lo mínimo que piden las lecturas de cobranza. */
function dbFalso(datos: { cuotas: Fila[]; proyecto: Fila & { pagos: Fila[] }; enlaces: Fila[] }) {
  const log: string[] = [];
  const db = {
    $executeRaw: async () => (log.push("candado"), 1),
    proyectoCuota: {
      findMany: async ({ where }: { where: { id?: { in: string[] }; moneda?: { not: string } } }) => (
        log.push("cuotas"), datos.cuotas.filter((c) => (!where.id || where.id.in.includes(c.id as string)) && (!where.moneda || c.moneda !== where.moneda.not))
      ),
    },
    proyecto: { findMany: async () => (log.push("proyecto"), [{ id: "p", ...datos.proyecto, pagos: datos.proyecto.pagos.filter((x) => !x.anuladoEl) }]) },
    proyectoCambio: { findMany: async ({ where }: { where: { despues: { in: string[] } } }) => (log.push("enlaces"), datos.enlaces.filter((e) => where.despues.in.includes(e.despues as string))) },
  };
  return { db: db as never, log };
}
const servidor = async () => {
  prepararAccionesDeServidor();
  return import("./cobranza.server");
};
const PRESUPUESTO = (precio: number) => [{ ivaPct: 0, tcVenta: null, items: [{ cantidad: 1, costo: 0, precio, moneda: "ARS", recargoPct: null }] }];

test("D-f originalesDeCobros: proyecto en pesos con cuota en USD devuelve el original; enlace viejo sin monto, la cuota entera sólo si no es en pesos", async () => {
  const { originalesDeCobros } = await servidor();
  const { db } = dbFalso({
    cuotas: [{ id: "U", monto: 100, moneda: "USD" }, { id: "V", monto: 80, moneda: "USD" }, { id: "A", monto: 5000, moneda: "ARS" }],
    proyecto: { moneda: "ARS", pagos: [] },
    enlaces: [{ entidadId: "U", antes: "60.00 USD", despues: "p1" }, { entidadId: "V", antes: null, despues: "p2" }, { entidadId: "A", antes: null, despues: "p3" }],
  });
  const m = await originalesDeCobros("t", [{ moneda: "ARS", pagos: [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }] }] as never, db);
  assert.deepEqual(m.get("p1"), { original: { monto: 60, moneda: "USD" }, cuotaId: "U" });
  assert.deepEqual(m.get("p2"), { original: { monto: 80, moneda: "USD" }, cuotaId: "V" });
  assert.deepEqual(m.get("p3"), { original: null, cuotaId: "A" });
  assert.equal(m.has("p4"), false); // sin enlace: suelto
});

test("v2 #3/#4 carrera: «Marcar cobrado» traba la cobranza y relee ADENTRO; si entró un cobro manual, no asienta de más", async () => {
  const { trabarCobranza, pendienteDeLaCuota, cobranzasDelNegocio } = await servidor();
  const datos = { cuotas: [{ id: "a", tipo: "COBRO", monto: 1000, moneda: "ARS", venceEl: dias(-5), pagadoEl: null }, { id: "b", tipo: "COBRO", monto: 1000, moneda: "ARS", venceEl: dias(10), pagadoEl: null }], proyecto: { moneda: "ARS", presupuestos: PRESUPUESTO(2000), pagos: [] as Fila[] }, enlaces: [] };
  const { db, log } = dbFalso(datos);
  // T1 (marcarCuota) lee afuera: a la vieja le faltan 1000.
  const afuera = await pendienteDeLaCuota("t", "p", "a", {}, 0, db);
  assert.equal(afuera?.pendiente, 1000);
  // T2 (registrarCobro manual de 1000) gana el candado y graba.
  datos.proyecto.pagos.push({ id: "m", monto: 1000 });
  // T1 entra a su transacción: candado primero, relectura con el mismo `tx` después.
  log.length = 0;
  await trabarCobranza(db, "t", "p");
  const adentro = await pendienteDeLaCuota("t", "p", "a", {}, 0, db);
  assert.equal(log[0], "candado");
  assert.ok(log.length > 1 && log.slice(1).every((x) => x !== "candado"));
  assert.equal(adentro?.pendiente, 0); // ≠ 1000 → «cambio»: no se graba nada (saldo nunca negativo)
  assert.ok(Math.abs(adentro!.pendiente - afuera!.pendiente) > 0.005);
  // Al revés (T1 primero, asentó 1000 por «a»): el cobro manual ve por cobrar 1000 y uno de 1000,01 no pasa el tope.
  datos.proyecto.pagos = [{ id: "x", monto: 1000 }];
  const cob = (await cobranzasDelNegocio("t", {}, 0, ["p"], db)).get("p")!;
  assert.equal(cob.porCobrar, 1000);
  assert.equal(pasaElTope(cob, 1000), false);
  assert.equal(pasaElTope(cob, 1000.02), true);
});

test("v2 #3/#4: las tres acciones que mueven la cobranza traban el candado como primera línea de la transacción y releen con `tx`", () => {
  const fuente = (archivo: string, funcion: string) => {
    const s = readFileSync(new URL(archivo, import.meta.url), "utf8");
    const i = s.indexOf(`export async function ${funcion}(`);
    assert.ok(i >= 0, funcion);
    const cuerpo = s.slice(i, s.indexOf("\nexport ", i + 10));
    const tx = cuerpo.indexOf("tenantTransaction(async (tx");
    assert.ok(tx >= 0, `${funcion}: sin transacción`);
    const lineas = cuerpo.slice(tx).split("\n").slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith("//") && l !== "if (esCobro) {");
    return { cuerpo, primera: lineas[0] };
  };
  const marcar = fuente("./acciones-ficha.ts", "marcarCuota");
  assert.match(marcar.primera, /^await trabarCobranza\(tx, tenantId, proyectoId\);$/);
  assert.match(marcar.cuerpo, /pendienteDeLaCuota\(tenantId, proyectoId, id, tc, margenPct, tx\)/);
  assert.match(marcar.cuerpo, /pasaElTope\(ahora\.cob, importe\)/);
  const registrar = fuente("./acciones.ts", "registrarCobro");
  assert.match(registrar.primera, /^await trabarCobranza\(tx, tenantId, proyectoId\);$/);
  assert.match(registrar.cuerpo, /cobranzasDelNegocio\(tenantId, tc, config\.margenPct, \[proyectoId\], tx\)/);
  assert.match(registrar.cuerpo, /pasaElTope\(cob, monto\)/);
  const anular = fuente("./acciones-ficha.ts", "anularCobroFicha");
  assert.match(anular.primera, /^await trabarCobranza\(tx, tenantId, pago\.proyectoId\);$/);
});

test("sin presupuesto aprobado: una cuota vencida no suma vencido ni próximos (I1 e I5 valen siempre)", () => {
  const c = cobranza(0, []);
  const r = conciliarConCobros([q(500, -5), q(300, 3)], {}, c, HOY);
  assert.equal(r.aCobrar, 0);
  assert.equal(r.cobrosVencidos, 0);
  assert.equal(r.cantCobrosVencidos, 0);
  assert.equal(r.aCobrar7, 0);
});

test("V4-2 servidor: «Marcar cobrado» y la cuota manual leen las previstas pero las dejan fuera del reparto (como Administración)", async () => {
  const { pendienteDeLaCuota, cobranzaConCuotas } = await servidor();
  const cuotas = previstasV4().map((q) => ({ ...q, prevista: !!(q as { prevista?: boolean }).prevista }));
  const { db } = dbFalso({ cuotas, proyecto: { moneda: "ARS", presupuestos: PRESUPUESTO(1000), pagos: [] }, enlaces: [] });
  assert.equal((await pendienteDeLaCuota("t", "p", "M", {}, 0, db))?.pendiente, 300);
  const { cuotas: leidas, cob } = await cobranzaConCuotas(db, "t", "p", {}, 0);
  assert.equal(lugarParaCobroManual(leidas, {}, cob).lugar, 700);
  // Marcada M por 300: por cobrar 700, Administración (sin previstas) ve la real cobrada y nada vencido.
  const despues = cobranza(1000, [{ monto: 300, cuotaId: "M" }]);
  const admin = conciliarConCobros([{ ...cuotas[2], pagadoEl: HOY }], {}, despues, HOY);
  assert.equal(despues.porCobrar, 700);
  assert.equal(admin.cobrosVencidos, 0);
});

// ── Certificación v5 ────────────────────────────────────────────────────────

/** Generador con semilla fija (congruencial): los 2000 casos son siempre los mismos. */
function semilla(n: number) {
  let s = n >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/** Marca todas las cuotas por su pendiente, de la más vieja a la más nueva, como `marcarCuota` (pesos + original). */
function marcarTodas(cuotas: CuotaLeida[], tc: Record<string, number>, cobros: CobroRegistrado[], cobrar: () => Cobranza) {
  for (let vuelta = 0; vuelta < cuotas.length; vuelta++) {
    const pend = pendientesDeCobro(cuotas, tc, cobrar());
    const i = cuotas.map((_, k) => k).filter((k) => !cuotas[k].pagadoEl && pend[k] > 0).sort((a, b) => cuotas[a].venceEl.getTime() - cuotas[b].venceEl.getTime())[0];
    if (i === undefined) break;
    cobros.push({ monto: aPesos(pend[i], cuotas[i].moneda, tc), cuotaId: cuotas[i].id, original: cuotas[i].moneda !== "ARS" ? { monto: Number(pend[i].toFixed(2)), moneda: cuotas[i].moneda } : null });
    cuotas[i] = { ...cuotas[i], pagadoEl: HOY };
  }
  return cobrar();
}

test("v5 F1: proyecto en USD, 2 cuotas de US$ 902,04 y un anticipo suelto en pesos: marcar ambas salda al centavo", () => {
  const tc = 1002.32;
  const cuotas: CuotaLeida[] = [qi("c0", 902.04, -1, { moneda: "USD" }), qi("c1", 902.04, 0, { moneda: "USD" })];
  const cobros: CobroRegistrado[] = [{ monto: 115_838.5 }];
  const v = { moneda: "USD", cambioVenta: 1000, tcHoy: tc };
  const final = marcarTodas(cuotas, { USD: tc }, cobros, () => cobranzaEnMoneda(2 * 902.04 * 1000, cobros, v));
  assert.equal(final.enMoneda?.saldo, 0);
  assert.equal(final.porCobrar, 0);
});

test("v5 F1: marcar todas las cuotas en cadena deja por cobrar 0 exacto (proyecto ARS y USD, 2000 casos con semilla fija)", () => {
  for (const moneda of ["ARS", "USD"]) {
    const r = semilla(moneda === "ARS" ? 5151 : 7373);
    const malos: string[] = [];
    for (let k = 0; k < 2000; k++) {
      const tcHoy = Math.round((800 + r() * 900) * 100) / 100;
      const cambioVenta = moneda === "USD" ? Math.round((800 + r() * 900) * 100) / 100 : 1;
      const n = 1 + Math.floor(r() * 4);
      // Las cuotas suman el total, en la moneda del proyecto; un anticipo suelto en pesos (o nada).
      const montos = Array.from({ length: n }, () => (moneda === "ARS" ? Math.round(r() * 2_000_000_00) / 100 : Math.round(r() * 5000_00) / 100) + 1);
      const totalM = montos.reduce((s, m) => s + m, 0);
      const totalPesos = moneda === "ARS" ? Math.round(totalM * 100) / 100 : totalM * cambioVenta;
      const cuotas: CuotaLeida[] = montos.map((m, j) => qi(`c${j}`, m, j * 30 - 10, { moneda }));
      const cobros: CobroRegistrado[] = r() < 0.8 ? [{ monto: Math.round(r() * totalM * 0.6 * (moneda === "ARS" ? 1 : tcHoy) * 100) / 100 + 0.5 }] : [];
      const v = { moneda, cambioVenta, tcHoy };
      const final = marcarTodas(cuotas, { USD: tcHoy }, cobros, () => cobranzaEnMoneda(totalPesos, cobros, v));
      if (final.porCobrar !== 0 || (final.enMoneda && final.enMoneda.saldo > 0)) malos.push(`${moneda} k${k}: queda ${final.enMoneda?.saldo ?? final.porCobrar}`);
    }
    assert.deepEqual(malos.slice(0, 3), [], `${malos.length}/2000 dejan algo por cobrar sin cuota pendiente`);
  }
});

test("v5 F2: una cuota prevista que se marcó cuenta igual en la ficha y en Administración (una sola regla)", () => {
  const P = qi("P", 500, -20, { prevista: true, pagadoEl: dias(-19) });
  const R = qi("R", 500, -5);
  const S = qi("S", 300, 40, { prevista: true });
  const c = cobranza(1000, [{ monto: 500, cuotaId: "P" }]);
  // Lo que deja pasar el filtro de consulta compartido, evaluado sobre las cuotas: lo mismo que `esPrevista`.
  const pasa = (q: { prevista?: boolean; pagadoEl: Date | null }) => !(q.prevista === SIN_PREVISTAS_SIN_MARCAR.NOT.prevista && q.pagadoEl === SIN_PREVISTAS_SIN_MARCAR.NOT.pagadoEl);
  const leidas = [P, R, S].filter(pasa);
  assert.deepEqual(leidas.map((q) => q.id), ["P", "R"]);
  assert.ok([P, R, S].every((q) => pasa(q) === !esPrevista(q)));
  const ficha = pendientesDeCobro([P, R, S], {}, c);
  const admin = pendientesDeCobro(leidas, {}, c);
  assert.equal(ficha[1], admin[1]);
  assert.equal(admin[1], 500);
});

test("v5 F2 servidor: las lecturas de la cobranza usan la regla compartida; marcar y regenerar no pisan una marcada", () => {
  const leer = (archivo: string) => readFileSync(new URL(archivo, import.meta.url), "utf8");
  for (const archivo of ["./empresa.server.ts", "./ficha.server.ts", "./ia.server.ts"]) {
    const s = leer(archivo);
    assert.ok(s.includes("SIN_PREVISTAS_SIN_MARCAR"), `${archivo}: sin la regla compartida`);
    // Una lectura de cuotas que deja afuera las previstas sin pedir `pagadoEl: null` excluiría también las marcadas.
    for (const linea of s.split("\n").filter((l) => /proyectoCuota\.findMany|cuotas: \{ where/.test(l) && /prevista: false/.test(l))) assert.match(linea, /pagadoEl: null/, `${archivo}: ${linea.trim().slice(0, 90)}`);
  }
  const acc = leer("./acciones-ficha.ts");
  assert.match(acc, /proyectoCuota\.updateMany\(\{ where: \{ id, tenantId, pagadoEl: null, anuladoEl: null, prevista: false, monto: c\.monto, moneda: c\.moneda \}/);
  const gestion = leer("./gestion.server.ts");
  const plan = gestion.slice(gestion.indexOf("async function aplicarPlan("));
  assert.match(plan, /tx\.proyectoCuota\.updateMany\(\{ where: \{ id: previa\.id, tenantId, pagadoEl: null \}, data: datos \}\)/);
  assert.match(plan, /r\.count === 0/);
  assert.doesNotMatch(plan, /proyectoCuota\.update\(\{/);
});

test("v5 (e): una cuota en USD de un proyecto en pesos pagada con el dólar a 1000 muestra lo pagado, no los pesos de hoy", () => {
  const U = qi("U", 100, -10, { moneda: "USD", pagadoEl: dias(-9) });
  const A = qi("A", 50_000, -8, { pagadoEl: dias(-7) });
  const C = qi("C", 50_000, -6, { pagadoEl: dias(-5) });
  const c = cobranza(250_000, [{ monto: 100_000, cuotaId: "U", original: { monto: 100, moneda: "USD" } }, { monto: 50_000, cuotaId: "A" }, { monto: 50_000 }]);
  // El cashflow sigue en pesos de hoy (V4-1): con el dólar a 1500, los $ 100.000 son US$ 66,66.
  assert.equal(repartoDeCobros([U, A, C], { USD: 1500 }, c).cobrado[0], 66.66);
  const pagado = pagadoDeCuota(U, c);
  assert.deepEqual(pagado, { monto: 100, moneda: "USD", pesos: 100_000 });
  assert.match(textoPagado(pagado!), /^US\$\s?100 · \$\s?100\.000$/);
  assert.deepEqual(pagadoDeCuota(A, c), { monto: 50_000, moneda: "ARS", pesos: null });
  // Cubierta con un cobro suelto (sin cobro propio), pendiente, o un pago a proveedor: no hay «pagado» propio.
  assert.equal(pagadoDeCuota(C, c), null);
  assert.equal(pagadoDeCuota(qi("N", 10, 1), c), null);
  assert.equal(pagadoDeCuota({ ...U, tipo: "PAGO" }, c), null);
});

test("v6 F1-bis: proyecto USD sin cobros, 211,54 + 268,68 USD a 975,01: pendientes exactos y marcar todo salda a 0", () => {
  const tcHoy = 975.01;
  const cuotas = [q(211.54, -5, { moneda: "USD" }), q(268.68, 10, { moneda: "USD" })];
  const c = cobranzaEnMoneda(480.22 * tcHoy, [], { moneda: "USD", cambioVenta: tcHoy, tcHoy });
  assert.deepEqual(pendientesDeCobro(cuotas, { USD: tcHoy }, c), [211.54, 268.68]);
  const pagado = cobranzaEnMoneda(480.22 * tcHoy, [211.54, 268.68].map((m) => ({ monto: m * tcHoy, original: { monto: m, moneda: "USD" } })), { moneda: "USD", cambioVenta: tcHoy, tcHoy });
  assert.equal(pagado.porCobrar, 0);
  const r = conciliarConCobros(cuotas, { USD: tcHoy }, c, HOY);
  assert.ok(r.cobrosVencidos + r.aCobrar7 <= c.porCobrar, "en pantalla, vencido + 7 días ≤ por cobrar");
});

test("v7 F1: proyecto USD con una cuota en pesos y tres en USD: Σ pendientes en USD no pasa el saldo en USD", () => {
  const q = (id: string, monto: number, d: number, moneda = "ARS") => ({ id, tipo: "COBRO", monto, moneda, venceEl: dias(d), pagadoEl: null, anuladoEl: null, prevista: false });
  const tc = { USD: 1029 };
  const cuotas = [q("A", 154281.33, -15), q("B", 750.88, -10, "USD"), q("C", 488.29, -3, "USD"), q("D", 1169.44, 8, "USD")];
  const c = cobranzaEnMoneda(1842.07 * 1029, [], { moneda: "USD", cambioVenta: 1029, tcHoy: 1029 });
  const p = pendientesDeCobro(cuotas, tc, c);
  const enUSD = cuotas.reduce((s, x, i) => s + (x.moneda === "USD" ? p[i] : aPesos(p[i], x.moneda, tc) / tc.USD), 0);
  assert.ok(enUSD <= c.enMoneda!.saldo + 1e-9, `Σ USD ${enUSD} > saldo ${c.enMoneda!.saldo}`);
});
