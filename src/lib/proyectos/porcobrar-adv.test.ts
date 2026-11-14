// Certificación adversarial de «por cobrar» (PR #110, 11/11/2026): indicador «A cobrar», renglones de Cuentas a cobrar y
// proyección de caja tienen que dar el mismo número. F1 (proyección con cobro suelto), F2 (calendario corto) y F3
// (desglose eventos / empresa). Los cobros en pesos de un proyecto en USD (cambio de hoy vs. del día) son de otra PR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cobranza, cobranzaEnMoneda, conciliarConCobros, repartoDelNegocio, resumenConCobranza, sinCalendarioDelNegocio, type Cobranza } from "./cobranza-core";
import { aPesos, proyeccionDeCaja } from "./gestion-core";

const hoy = new Date(2026, 10, 11);
const d = (dias: number) => new Date(hoy.getTime() + dias * 864e5);
const sum = (a: number[]) => Math.round(a.reduce((s, x) => s + x, 0) * 100) / 100;
const tc = { USD: 1000 };
type Cuota = { id: string; proyectoId: string | null; tipo: string; monto: number; moneda: string; venceEl: Date; pagadoEl: Date | null };

/** Los tres números de Administración, como los arma el servidor (recuadrosDeCuotas + cashflowDeEmpresa). */
function tresNumeros(cuotas: Cuota[], t: Readonly<Record<string, number>>, m: ReadonlyMap<string, Cobranza>) {
  const { pendiente } = repartoDelNegocio(cuotas, t, m);
  const kpi = resumenConCobranza(cuotas, t, m, hoy).aCobrar;
  const sinCal = sinCalendarioDelNegocio(cuotas, pendiente, t, m);
  const filas = sum([...cuotas.map((q, i) => (q.tipo === "COBRO" && !q.pagadoEl ? aPesos(pendiente[i], q.moneda, t) : 0)), ...sinCal.map((f) => f.pesos)]);
  const conPendiente = cuotas.map((q, i) => ({ ...q, pendiente: pendiente[i] }));
  const proy = sum(proyeccionDeCaja({ cajaHoy: 0, cuotas: conPendiente, sueldosMes: 0, fijos: [], tiposDeCambio: t, meses: 6, hoy }).map((x) => x.cobros));
  return { kpi, filas, proy, sinCal };
}

test("F2 calendario corto (aprobado 100, cuota 60, sin cobros): renglón «Sin calendario» de 40 y la lista suma 100", () => {
  const cuotas: Cuota[] = [{ id: "q1", proyectoId: "P", tipo: "COBRO", monto: 60, moneda: "ARS", venceEl: d(3), pagadoEl: null }];
  const r = tresNumeros(cuotas, tc, new Map([["P", cobranza(100, [])]]));
  assert.deepEqual(r.sinCal, [{ proyectoId: "P", monto: 40, moneda: "ARS", pesos: 40 }]);
  assert.equal(r.kpi, 100);
  assert.equal(r.filas, 100, "KPI A cobrar != suma de renglones de Cuentas a cobrar");
  // Sin fecha no entra a la proyección: lo que tiene fecha, sí.
  assert.equal(r.proy, 60);
});

test("F1 cobro suelto parcial (aprobado 100, cuotas 50+50, cobro manual 30): la proyección de caja cobra 70, no 100", () => {
  const cuotas: Cuota[] = [
    { id: "q1", proyectoId: "P", tipo: "COBRO", monto: 50, moneda: "ARS", venceEl: d(3), pagadoEl: null },
    { id: "q2", proyectoId: "P", tipo: "COBRO", monto: 50, moneda: "ARS", venceEl: d(40), pagadoEl: null },
  ];
  const r = tresNumeros(cuotas, tc, new Map([["P", cobranza(100, [{ monto: 30 }])]]));
  assert.equal(r.kpi, 70);
  assert.equal(r.filas, 70);
  assert.equal(r.proy, 70, "proyección de caja (cobros) != A cobrar");
  assert.deepEqual(r.sinCal, []);
});

test("F1 proyección: sin `pendiente` (cuota de la empresa o pago) sigue usando el monto", () => {
  const m = proyeccionDeCaja({
    cajaHoy: 0,
    cuotas: [
      { tipo: "COBRO", monto: 25, moneda: "ARS", venceEl: d(1), pagadoEl: null },
      { tipo: "COBRO", monto: 50, moneda: "ARS", venceEl: d(1), pagadoEl: null, pendiente: 0 },
      { tipo: "PAGO", monto: 10, moneda: "ARS", venceEl: d(1), pagadoEl: null, pendiente: 3 },
    ],
    sueldosMes: 0,
    fijos: [],
    tiposDeCambio: tc,
    meses: 1,
    hoy,
  });
  assert.deepEqual([m[0].cobros, m[0].proveedores], [25, 10]);
});

test("F2 proyecto en USD con calendario corto: «Sin calendario» en dólares y la lista suma el KPI", () => {
  const t2 = { USD: 1500 };
  const cob = cobranzaEnMoneda(100_000, [], { moneda: "USD", cambioVenta: 1000, tcHoy: 1500 }); // 100 USD
  const cuotas: Cuota[] = [{ id: "q1", proyectoId: "P", tipo: "COBRO", monto: 60, moneda: "USD", venceEl: d(5), pagadoEl: null }];
  const r = tresNumeros(cuotas, t2, new Map([["P", cob]]));
  assert.deepEqual(r.sinCal, [{ proyectoId: "P", monto: 40, moneda: "USD", pesos: 60_000 }]);
  assert.equal(r.kpi, 150_000);
  assert.equal(r.filas, 150_000);
});

test("F2 sin cuotas, sin aprobado, saldado o de la empresa: el renglón aparece sólo cuando falta cobrar algo sin cuota", () => {
  const m = new Map<string, Cobranza>([
    ["SIN", cobranza(500, [{ monto: 100 }])], // aprobado sin ninguna cuota: 400 sin calendario
    ["CERO", cobranza(0, [])], // sin aprobado: nada
    ["SALDADO", cobranza(100, [{ monto: 100 }])],
    ["CUBIERTO", cobranza(100, [])],
  ]);
  const cuotas: Cuota[] = [
    { id: "c1", proyectoId: "CUBIERTO", tipo: "COBRO", monto: 120, moneda: "ARS", venceEl: d(3), pagadoEl: null }, // calendario largo: se recorta
    { id: "e1", proyectoId: null, tipo: "COBRO", monto: 25, moneda: "ARS", venceEl: d(3), pagadoEl: null },
  ];
  const r = tresNumeros(cuotas, tc, m);
  assert.deepEqual(r.sinCal, [{ proyectoId: "SIN", monto: 400, moneda: "ARS", pesos: 400 }]);
  assert.equal(r.kpi, 400 + 100 + 25);
  assert.equal(r.filas, r.kpi);
});

test("C proyecto USD con el dólar movido: renglones (con «Sin calendario») vs KPI", () => {
  // vendido a 1000, total 100 USD = 100000 ARS; cobró 40 USD suelto en pesos a 1000; hoy 1500
  const cob = cobranzaEnMoneda(100000, [{ monto: 40000 }], { moneda: "USD", cambioVenta: 1000, tcHoy: 1500 });
  const t2 = { USD: 1500 };
  const cuotas: Cuota[] = [
    { id: "q1", proyectoId: "P", tipo: "COBRO", monto: 50, moneda: "USD", venceEl: d(-2), pagadoEl: null },
    { id: "q2", proyectoId: "P", tipo: "COBRO", monto: 50, moneda: "USD", venceEl: d(40), pagadoEl: null },
  ];
  const r = tresNumeros(cuotas, t2, new Map([["P", cob]]));
  assert.ok(Math.abs(r.filas - r.kpi) <= 0.02 * 1500, "renglones USD != KPI");
  assert.ok(Math.abs(r.proy - r.kpi) <= 0.02 * 1500, "proyección != KPI");
});

test("F3 cuota de cobro de la empresa: «A cobrar» se separa en eventos (= Números) y empresa", () => {
  const cob = cobranza(100, []);
  const cuotas: Cuota[] = [
    { id: "q1", proyectoId: "P", tipo: "COBRO", monto: 100, moneda: "ARS", venceEl: d(3), pagadoEl: null },
    { id: "e1", proyectoId: null, tipo: "COBRO", monto: 25, moneda: "ARS", venceEl: d(3), pagadoEl: null },
  ];
  const r = resumenConCobranza(cuotas, tc, new Map([["P", cob]]), hoy);
  assert.equal(r.aCobrarDeEventos, cob.porCobrar, "eventos != Números");
  assert.equal(r.aCobrarDeEmpresa, 25);
  assert.equal(r.aCobrar, 125);
});

test("E cobro de más (saldo a favor): por cobrar 0 en Números, Administración y la ficha; sin renglón", () => {
  const cob = cobranza(100, [{ monto: 130 }]);
  const r = resumenConCobranza([], tc, new Map([["P", cob]]), hoy);
  assert.equal(r.aCobrar, 0);
  assert.equal(r.aCobrarDeEventos, 0);
  assert.equal(conciliarConCobros([], tc, cob, hoy).aCobrar, 0);
  assert.deepEqual(sinCalendarioDelNegocio([], [], tc, new Map([["P", cob]])), []);
});
