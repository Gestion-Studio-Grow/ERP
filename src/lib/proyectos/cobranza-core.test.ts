import { test } from "node:test";
import assert from "node:assert/strict";
import { cobranza, conciliarConCobros, resumenConCobranza, totalAprobado } from "./cobranza-core";
import { resumenCuotas } from "./gestion-core";

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
  const r = conciliarConCobros(crudo, cobranza(90_912_140, [{ monto: 45_456_070 }]));
  assert.equal(r.cobrado, 45_456_070);
  assert.equal(r.aCobrar, 45_456_070);
});

test("conciliarConCobros: lo vencido y lo de 7 días nunca pasan de lo que falta cobrar", () => {
  const cuotas = [
    { tipo: "COBRO", monto: 600, moneda: "ARS", venceEl: dias(-3), pagadoEl: null },
    { tipo: "COBRO", monto: 400, moneda: "ARS", venceEl: dias(3), pagadoEl: null },
    { tipo: "PAGO", monto: 300, moneda: "ARS", venceEl: dias(-3), pagadoEl: null },
  ];
  // Se cobraron 700 por fuera de las cuotas: faltan 300.
  const r = conciliarConCobros(resumenCuotas(cuotas, TC, HOY), cobranza(1000, [{ monto: 700 }]));
  assert.equal(r.aCobrar, 300);
  assert.equal(r.cobrosVencidos, 300);
  assert.equal(r.aCobrar7, 300);
  assert.equal(r.cantCobrosVencidos, 1);
  assert.equal(r.aPagar, 300); // los pagos a proveedores no se tocan
  const saldado = conciliarConCobros(resumenCuotas(cuotas, TC, HOY), cobranza(1000, [{ monto: 1000 }]));
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
