import { test } from "node:test";
import assert from "node:assert/strict";
import { conPagosParciales, conPartesComoPagadas, descontarPartes, faltaDelPago, partesEnMonedaDelPlan, parteEnSuMoneda, porPagarDeCuotas } from "./pago-parcial-core";
import { resultadoReal } from "./core";
import { resumenCuotas } from "./gestion-core";

const tc = { USD: 1000 };

test("parteEnSuMoneda: pesos en ARS; en USD el original del enlace manda, sin él los pesos al cambio de hoy", () => {
  assert.equal(parteEnSuMoneda("ARS", 250.4, null, tc), 250.4);
  assert.equal(parteEnSuMoneda("USD", 20_250, "20.25 USD", { USD: 1500 }), 20.25, "el cambio de hoy no revalúa lo pagado");
  assert.equal(parteEnSuMoneda("USD", 20_000, null, tc), 20);
  assert.equal(parteEnSuMoneda("USD", 20_000, null, {}), 0, "sin cambio no se inventa");
});

test("faltaDelPago: nunca negativo; al centavo", () => {
  assert.equal(faltaDelPago(600, 250.4), 349.6);
  assert.equal(faltaDelPago(600, 700), 0);
});

test("conPagosParciales: sólo las de pago sin marcar con partes; no toca cobros, marcadas ni anuladas, ni el arreglo recibido", () => {
  const cuotas = [
    { id: "c", tipo: "COBRO", monto: 100 },
    { id: "p", tipo: "PAGO", monto: 600 },
    { id: "m", tipo: "PAGO", monto: 300, pagadoEl: new Date(0) },
    { id: "x", tipo: "PAGO", monto: 50, anuladoEl: new Date(0) },
    { id: "s", tipo: "PAGO", monto: 80 },
  ];
  const reparto = { pendiente: [100, 600, 0, 0, 80], cobrado: [0, 0, 300, 0, 0] };
  const r = conPagosParciales(cuotas, reparto, new Map([["c", 10], ["p", 250.4], ["m", 100], ["x", 5]]));
  assert.deepEqual(r, { pendiente: [100, 349.6, 0, 0, 80], cobrado: [0, 250.4, 300, 0, 0] });
  assert.deepEqual(reparto.pendiente, [100, 600, 0, 0, 80]);
  assert.equal(conPagosParciales(cuotas, reparto, new Map()), reparto);
});

test("porPagarDeCuotas: vivas, reales y sin marcar, menos lo pagado en parte, en pesos de hoy", () => {
  const cuotas = [
    { id: "a", tipo: "PAGO", monto: 600, moneda: "ARS" },
    { id: "b", tipo: "PAGO", monto: 61, moneda: "USD" },
    { id: "prev", tipo: "PAGO", monto: 999, moneda: "ARS", prevista: true },
    { id: "cob", tipo: "COBRO", monto: 1000, moneda: "ARS" },
    { id: "pag", tipo: "PAGO", monto: 5, moneda: "ARS", pagadoEl: new Date(0) },
  ];
  assert.equal(porPagarDeCuotas(cuotas, new Map([["a", 250], ["b", 20.25]]), tc), 350 + 40_750);
});

test("resultadoReal (D6): lo que falta pagar por cuotas es costo y deuda; sin cuotas, igual que antes", () => {
  const t = { neto: 1000, costo: 600 } as Parameters<typeof resultadoReal>[0];
  const gastos = [{ neto: 250, iva: 0, pagadoEl: new Date(0), anuladoEl: null, rubro: "General" }];
  const antes = resultadoReal(t, gastos);
  assert.equal(antes.gananciaReal, 750, "sin las cuotas, la ganancia queda inflada");
  const r = resultadoReal(t, gastos, 350);
  assert.deepEqual({ costoReal: r.costoReal, porPagar: r.porPagar, ganancia: r.gananciaReal, desvio: r.desvio }, { costoReal: 600, porPagar: 350, ganancia: 400, desvio: 0 });
  assert.equal(resultadoReal(t, [], 600).conGastos, true, "sólo con cuotas comprometidas ya hay costo real");
  assert.equal(resultadoReal(t, [], 0).gananciaReal, null);
});

test("descontarPartes: lo pagado en parte cuenta como pagado cuando el plan cambia (no se le debe de más al proveedor)", () => {
  const sinMarcar = new Set<string>();
  // El anticipo pasa a 0 %: sale del plan; los 200 pagados en parte se descuentan del saldo (600 → 400).
  assert.deepEqual(descontarPartes([{ clave: "p:i1:saldo", monto: 600 }], new Map([["p:i1:anticipo", 200]]), sinMarcar), [{ clave: "p:i1:saldo", monto: 400 }]);
  // Baja el costo a 300 (150 + 150) con 250 ya pagados en el anticipo: el anticipo no baja de lo pagado y el saldo absorbe.
  assert.deepEqual(
    descontarPartes([{ clave: "p:i1:anticipo", monto: 150 }, { clave: "p:i1:saldo", monto: 150 }], new Map([["p:i1:anticipo", 250]]), sinMarcar),
    [{ clave: "p:i1:anticipo", monto: 250 }, { clave: "p:i1:saldo", monto: 50 }],
  );
  // Sin cambio de plan, nada se mueve; otro ítem no se toca; una cuota marcada no absorbe.
  const plan = [{ clave: "p:i1:anticipo", monto: 300 }, { clave: "p:i1:saldo", monto: 300 }, { clave: "p:i2:saldo", monto: 90 }];
  assert.deepEqual(descontarPartes(plan, new Map([["p:i1:anticipo", 200]]), sinMarcar), plan);
  assert.deepEqual(descontarPartes([{ clave: "p:i1:anticipo", monto: 300 }, { clave: "p:i1:saldo", monto: 100 }], new Map([["p:i1:saldo", 150]]), new Set(["p:i1:anticipo"])), [{ clave: "p:i1:anticipo", monto: 300 }, { clave: "p:i1:saldo", monto: 150 }]);
  // Lo pagado supera al ítem nuevo: la cuota que se va queda afuera (el gasto sigue siendo gasto) y el resto llega a cero.
  assert.deepEqual(descontarPartes([{ clave: "p:i1:saldo", monto: 100 }], new Map([["p:i1:anticipo", 250]]), sinMarcar), []);
  assert.equal(descontarPartes(plan, new Map(), sinMarcar).length, 3);
});

test("conPartesComoPagadas: «A pagar» baja con lo pagado en parte y «pagado» lo suma (MEDIA del certificador)", () => {
  const vence = new Date("2026-12-01T12:00:00Z");
  const cuotas = [
    { id: "p", tipo: "PAGO", monto: 600, moneda: "ARS", venceEl: vence, pagadoEl: null, anuladoEl: null },
    { id: "c", tipo: "COBRO", monto: 900, moneda: "ARS", venceEl: vence, pagadoEl: null, anuladoEl: null },
  ];
  const r = resumenCuotas(conPartesComoPagadas(cuotas, new Map([["p", 200], ["c", 50]])), {}, new Date("2026-11-14T12:00:00Z"));
  assert.deepEqual({ aPagar: r.aPagar, pagado: r.pagado, aCobrar: r.aCobrar }, { aPagar: 400, pagado: 200, aCobrar: 900 });
  assert.equal(conPartesComoPagadas(cuotas, new Map([["p", 600]])).filter((c) => c.tipo === "PAGO").length, 1, "pagada entera en partes: no queda falta");
});

test("partesEnMonedaDelPlan: si el ítem cambió de moneda, lo pagado en parte se pasa a la moneda nueva antes de descontarlo", () => {
  const cuotas = [
    { id: "a", clave: "p:i1:anticipo", moneda: "ARS" },
    { id: "b", clave: "p:i2:anticipo", moneda: "USD" },
    { id: "c", clave: "p:i3:anticipo", moneda: "ARS" },
  ];
  const plan = [
    { clave: "p:i1:saldo", moneda: "USD" },
    { clave: "p:i2:anticipo", moneda: "USD" },
  ];
  const r = partesEnMonedaDelPlan(cuotas, new Map([["a", 200], ["b", 20], ["c", 50]]), plan, { USD: 1000 });
  assert.deepEqual([...r], [["p:i1:anticipo", 0.2], ["p:i2:anticipo", 20]], "i3 ya no está en el plan: nada que descontar");
  // Con la moneda nueva: 600 USD de saldo menos 0,2 USD (los 200 pesos) = 599,8 (re-certificación, ADV-M2).
  assert.deepEqual(descontarPartes([{ clave: "p:i1:saldo", monto: 600 }], r, new Set()), [{ clave: "p:i1:saldo", monto: 599.8 }]);
  assert.equal(partesEnMonedaDelPlan(cuotas, new Map([["a", 200]]), plan, {}).size, 0, "sin cambio no se inventa una conversión");
});
