// Tests de los KPIs profundos del reporte (Reportes v2). Lógica pura — sin DB.
// Cada caso arma turnos con objetos planos y verifica una métrica a la vez.

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeDeepKpis, type KpiAppointment } from "./report-kpis";

// Helper: turno con defaults sanos; se overridea solo lo relevante al caso.
function appt(overrides: Partial<KpiAppointment> = {}): KpiAppointment {
  return {
    status: "COMPLETED",
    startsAt: new Date("2026-06-01T13:00:00.000Z"),
    endsAt: new Date("2026-06-01T14:00:00.000Z"), // 1 hora por default
    clientId: "c1",
    professionalName: "Ana",
    payment: { amount: 1000, method: "EFECTIVO" },
    ...overrides,
  };
}

test("set vacío devuelve todo en cero sin dividir por cero", () => {
  const k = computeDeepKpis([]);
  assert.equal(k.estados.resueltos, 0);
  assert.equal(k.estados.tasaNoShow, 0);
  assert.equal(k.estados.tasaCancelacion, 0);
  assert.equal(k.ticketPromedio, 0);
  assert.equal(k.retencion.tasaRecurrencia, 0);
  assert.deepEqual(k.mixMetodoPago, []);
  assert.deepEqual(k.rentabilidadHoraSilla, []);
});

test("tasa de no-show = ausencias / (completados + ausencias); cancelados no cuentan en el denominador", () => {
  const k = computeDeepKpis([
    appt({ status: "COMPLETED" }),
    appt({ status: "COMPLETED" }),
    appt({ status: "COMPLETED" }),
    appt({ status: "NO_SHOW", payment: null }),
    appt({ status: "CANCELLED", payment: null }),
  ]);
  // 1 no-show sobre 3 completados + 1 no-show = 4  → 0.25
  assert.equal(k.estados.tasaNoShow, 0.25);
  assert.equal(k.estados.completados, 3);
  assert.equal(k.estados.noShow, 1);
  assert.equal(k.estados.cancelados, 1);
});

test("tasa de cancelación = cancelados / turnos resueltos", () => {
  const k = computeDeepKpis([
    appt({ status: "COMPLETED" }),
    appt({ status: "NO_SHOW", payment: null }),
    appt({ status: "CANCELLED", payment: null }),
    appt({ status: "CANCELLED", payment: null }),
    // PENDING no es un turno "resuelto": no infla ni el numerador ni el denominador.
    appt({ status: "PENDING", payment: null }),
  ]);
  // 2 cancelados sobre 4 resueltos (1 comp + 1 no-show + 2 cancel) → 0.5
  assert.equal(k.estados.resueltos, 4);
  assert.equal(k.estados.tasaCancelacion, 0.5);
});

test("ticket promedio solo considera pagos aprobados", () => {
  const k = computeDeepKpis([
    appt({ payment: { amount: 1000, method: "EFECTIVO" } }),
    appt({ payment: { amount: 3000, method: "MERCADOPAGO" } }),
    appt({ status: "NO_SHOW", payment: null }), // no baja el promedio
  ]);
  assert.equal(k.ticketPromedio, 2000);
});

test("mix de método de pago agrupa cantidad y total, ordenado por total desc", () => {
  const k = computeDeepKpis([
    appt({ payment: { amount: 1000, method: "EFECTIVO" } }),
    appt({ payment: { amount: 500, method: "EFECTIVO" } }),
    appt({ payment: { amount: 5000, method: "MERCADOPAGO" } }),
    appt({ payment: { amount: 800, method: "TRANSFERENCIA" } }),
  ]);
  assert.equal(k.mixMetodoPago.length, 3);
  // MERCADOPAGO primero (5000 > 1500 > 800)
  assert.deepEqual(k.mixMetodoPago[0], { method: "MERCADOPAGO", cantidad: 1, total: 5000 });
  assert.deepEqual(k.mixMetodoPago[1], { method: "EFECTIVO", cantidad: 2, total: 1500 });
  assert.deepEqual(k.mixMetodoPago[2], { method: "TRANSFERENCIA", cantidad: 1, total: 800 });
});

test("retención: recurrentes = clientes con 2+ turnos resueltos en el período", () => {
  const k = computeDeepKpis([
    appt({ clientId: "ana", status: "COMPLETED", payment: null }),
    appt({ clientId: "ana", status: "COMPLETED", payment: null }), // ana: recurrente
    appt({ clientId: "beto", status: "NO_SHOW", payment: null }),
    appt({ clientId: "beto", status: "CANCELLED", payment: null }), // beto: recurrente (2 resueltos)
    appt({ clientId: "caro", status: "COMPLETED", payment: null }), // caro: esporádico
    // Un PENDING de caro NO cuenta como turno resuelto → caro sigue esporádico.
    appt({ clientId: "caro", status: "PENDING", payment: null }),
  ]);
  assert.equal(k.retencion.clientesUnicos, 3);
  assert.equal(k.retencion.recurrentes, 2);
  assert.equal(k.retencion.esporadicos, 1);
  assert.equal(k.retencion.tasaRecurrencia, 2 / 3);
});

test("rentabilidad hora-silla = ingresos / horas ocupadas, solo turnos completados con pago", () => {
  const k = computeDeepKpis([
    // Ana: 2 turnos completados, 1h c/u = 2h, $2000 y $4000 → $6000 / 2h = 3000/h
    appt({
      professionalName: "Ana",
      startsAt: new Date("2026-06-01T13:00:00.000Z"),
      endsAt: new Date("2026-06-01T14:00:00.000Z"),
      payment: { amount: 2000, method: "EFECTIVO" },
    }),
    appt({
      professionalName: "Ana",
      startsAt: new Date("2026-06-02T13:00:00.000Z"),
      endsAt: new Date("2026-06-02T14:00:00.000Z"),
      payment: { amount: 4000, method: "EFECTIVO" },
    }),
    // Beto: 1 turno de 2h por $4000 → 2000/h
    appt({
      professionalName: "Beto",
      startsAt: new Date("2026-06-01T13:00:00.000Z"),
      endsAt: new Date("2026-06-01T15:00:00.000Z"),
      payment: { amount: 4000, method: "MERCADOPAGO" },
    }),
    // Un no-show de Beto NO suma horas ni ingresos (no ocupó factura).
    appt({ professionalName: "Beto", status: "NO_SHOW", payment: null }),
  ]);
  assert.equal(k.rentabilidadHoraSilla.length, 2);
  // Ana primera: 3000/h > 2000/h
  assert.deepEqual(k.rentabilidadHoraSilla[0], {
    label: "Ana",
    ingresos: 6000,
    horas: 2,
    porHora: 3000,
  });
  assert.deepEqual(k.rentabilidadHoraSilla[1], {
    label: "Beto",
    ingresos: 4000,
    horas: 2,
    porHora: 2000,
  });
});

test("duración no positiva (dato sucio) aporta 0 horas, sin NaN/Infinity", () => {
  const k = computeDeepKpis([
    appt({
      professionalName: "Ana",
      startsAt: new Date("2026-06-01T14:00:00.000Z"),
      endsAt: new Date("2026-06-01T14:00:00.000Z"), // 0 min
      payment: { amount: 1000, method: "EFECTIVO" },
    }),
  ]);
  const ana = k.rentabilidadHoraSilla[0];
  assert.equal(ana.horas, 0);
  assert.equal(ana.porHora, 0); // no divide por cero
  assert.equal(Number.isFinite(ana.porHora), true);
});
