import { test } from "node:test";
import assert from "node:assert/strict";
import { cobranza, cobranzaEnMoneda, conciliarConCobros, leerOriginal, pendientesDeCobro, pendientesDelNegocio, resumenConCobranza, totalAprobado } from "./cobranza-core";
import { aPesos, enMonedaDeVenta, resumenCuotas } from "./gestion-core";

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
  assert.deepEqual(c, { total: 90_912_140, cobrado: 45_456_070, saldo: 45_456_070, porCobrar: 45_456_070, avancePct: 50 });
});

test("cobranza: cobrado de más deja saldo negativo, por cobrar 0 y avance 100", () => {
  const c = cobranza(1000, [{ monto: 1200 }]);
  assert.equal(c.saldo, -200);
  assert.equal(c.porCobrar, 0);
  assert.equal(c.avancePct, 100);
});

test("cobranza: sin presupuesto aprobado no hay nada por cobrar", () => {
  assert.deepEqual(cobranza(0, []), { total: 0, cobrado: 0, saldo: 0, porCobrar: 0, avancePct: 0 });
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
  // Aun si las cuotas no cierran con lo aprobado (marcadas sin cobro), el tope es sobre la suma.
  const raro = conciliarConCobros(cuotas, TC, cobranza(300, [{ monto: 200 }]), HOY);
  assert.equal(raro.cobrosVencidos, 0);
  assert.equal(raro.aCobrar7, 100);
});

test("QA 2026-004: un cobro manual de $10M baja el renglón del saldo a $35.456.070 y el renglón suma igual que el total", () => {
  const cuotas = [
    { id: "ant", proyectoId: "p4", tipo: "COBRO", monto: 45_456_070, moneda: "ARS", venceEl: dias(-40), pagadoEl: dias(-40) },
    { id: "sal", proyectoId: "p4", tipo: "COBRO", monto: 45_456_070, moneda: "ARS", venceEl: dias(-5), pagadoEl: null },
    { id: "otro", proyectoId: null, tipo: "COBRO", monto: 1000, moneda: "ARS", venceEl: dias(2), pagadoEl: null },
  ];
  const cob = cobranza(90_912_140, [{ monto: 45_456_070 }, { monto: 10_000_000 }]);
  assert.equal(cob.porCobrar, 35_456_070);
  const pend = pendientesDelNegocio(cuotas, TC, new Map([["p4", cob]]));
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
