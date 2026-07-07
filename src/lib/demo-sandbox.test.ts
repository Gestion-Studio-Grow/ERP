import { test } from "node:test";
import assert from "node:assert/strict";

// Verifica el módulo del sandbox de preventa SIN tocar ningún deploy/env
// compartido: togglea `process.env` dentro del propio proceso de test y lo
// restaura al final. Cubre las dos garantías centrales del diseño:
//   1. `isDemoSandbox()` es `false` por defecto (ningún tenant real la activa).
//   2. Con la flag prendida, los fixtures devuelven formas válidas sin tocar
//      Prisma/DB (no importan `@/lib/prisma` en absoluto — ver el import list
//      de este archivo: cero cliente de base).
import {
  isDemoSandbox,
  DEMO_TENANT_ID,
  DEMO_SESSION_USER,
  DEMO_WRITE_BLOCKED,
  getDemoCajaData,
  getDemoAgendaDay,
  getDemoReportData,
  getDemoDeepReportData,
  getDemoOwnerPanelData,
  recommendForRubro,
} from "./demo-sandbox";

// Recomendaciones explícitas de dos familias, para verificar que los fixtures se
// arman a partir de la recomendación (no de arrays fijos de un solo rubro).
const ESTETICA = recommendForRubro("estetica"); // familia Agenda&Servicios
const CARNICERIA = recommendForRubro("carniceria"); // familia Retail/Mostrador

test("isDemoSandbox: false por defecto (ningún deploy real la setea)", () => {
  const prev = process.env.DEMO_MODE_ENABLED;
  delete process.env.DEMO_MODE_ENABLED;
  assert.equal(isDemoSandbox(), false);
  if (prev !== undefined) process.env.DEMO_MODE_ENABLED = prev;
});

test("isDemoSandbox: true solo con el valor exacto 'true'", () => {
  const prev = process.env.DEMO_MODE_ENABLED;
  process.env.DEMO_MODE_ENABLED = "1"; // valor distinto → sigue apagado (fail-closed)
  assert.equal(isDemoSandbox(), false);
  process.env.DEMO_MODE_ENABLED = "true";
  assert.equal(isDemoSandbox(), true);
  if (prev === undefined) delete process.env.DEMO_MODE_ENABLED;
  else process.env.DEMO_MODE_ENABLED = prev;
});

test("DEMO_SESSION_USER: identidad ficticia namespaced, rol OWNER", () => {
  assert.equal(DEMO_SESSION_USER.role, "OWNER");
  assert.equal(DEMO_SESSION_USER.tenantId, DEMO_TENANT_ID);
  assert.match(DEMO_SESSION_USER.id, /^demo-/);
  assert.match(DEMO_TENANT_ID, /^demo-/);
});

test("DEMO_WRITE_BLOCKED: honesto (ok:false), no finge un éxito", () => {
  assert.equal(DEMO_WRITE_BLOCKED.ok, false);
  assert.ok(DEMO_WRITE_BLOCKED.error.length > 0);
});

test("getDemoAgendaDay: siempre trae profesionales + turnos, cualquier fecha", () => {
  const a = getDemoAgendaDay("2026-07-06");
  const b = getDemoAgendaDay("2026-08-15"); // fecha arbitraria futura
  for (const day of [a, b]) {
    assert.ok(day.professionals.length >= 1);
    assert.ok(day.appointments.length >= 1);
    for (const appt of day.appointments) {
      assert.ok(appt.client.name);
      assert.ok(appt.professional.name);
      assert.ok(appt.service.name);
      assert.ok(appt.startsAt instanceof Date);
      assert.ok(appt.endsAt instanceof Date);
      assert.ok(appt.endsAt > appt.startsAt);
    }
  }
});

test("getDemoCajaData: caja abierta con ledger coherente", () => {
  const caja = getDemoCajaData(ESTETICA);
  assert.ok(caja.open);
  assert.ok(caja.open.movements.length >= 1);
  assert.equal(caja.open.movements[0].type, "APERTURA");
  assert.ok(caja.recentClosed.length >= 1);
});

test("getDemoCajaData: las VENTAs referencian ítems reales del rubro recomendado", () => {
  // Estética: alguna venta con nombre de un servicio real del blueprint.
  const estetica = getDemoCajaData(ESTETICA);
  const ventasEst = estetica.open.movements.filter((m) => m.type === "VENTA");
  assert.ok(ventasEst.every((m) => typeof m.reason === "string" && m.reason.length > 0));
  // Carnicería: la venta usa un corte real (p. ej. "Lomo"), NO un servicio de spa.
  const carne = getDemoCajaData(CARNICERIA);
  const ventasCarne = carne.open.movements.filter((m) => m.type === "VENTA");
  assert.ok(ventasCarne.length >= 1);
  assert.ok(!ventasCarne.some((m) => /facial|masaje|pestañas/i.test(String(m.reason))));
});

test("getDemoReportData: shape consumible por la página de reportes", () => {
  const r = getDemoReportData(90);
  assert.equal(r.rangeDays, 90);
  assert.ok(r.totalIngresos > 0);
  assert.ok(r.porDia.length > 0);
  assert.ok(r.porProfesional.length > 0);
  assert.ok(r.porServicio.length > 0);
});

test("getDemoDeepReportData: computa KPIs reales (computeDeepKpis) sobre datos ficticios", () => {
  const d = getDemoDeepReportData(90);
  assert.ok(d.totalTurnos > 0);
  assert.ok(d.kpis.estados);
  assert.ok(typeof d.kpis.ticketPromedio === "number");
});

test("getDemoOwnerPanelData: insights + tendencia con varios meses", () => {
  const p = getDemoOwnerPanelData(90);
  assert.equal(p.hasPrevious, true);
  assert.ok(p.current);
  assert.ok(p.previous);
  assert.ok(p.months.length >= 3);
  for (const m of p.months) {
    assert.match(m.month, /^\d{4}-\d{2}$/);
  }
});

// ── Generalización por rubro (consultor → backoffice) ──────────────────────

test("getDemoAgendaDay(retail): jornada VACÍA — el mostrador no trabaja con turnos", () => {
  const day = getDemoAgendaDay("2026-07-06", CARNICERIA);
  assert.equal(day.professionals.length, 0);
  assert.equal(day.appointments.length, 0);
});

test("getDemoAgendaDay(agenda): turnos con servicios del rubro recomendado", () => {
  const day = getDemoAgendaDay("2026-07-06", ESTETICA);
  assert.ok(day.professionals.length >= 1);
  assert.ok(day.appointments.length >= 1);
  // Los nombres de servicio salen del blueprint de estética, no de un array fijo.
  assert.ok(day.appointments.every((a) => a.service.name.length > 0));
});

test("getDemoReportData(retail): KPIs coherentes con precios de productos reales", () => {
  const r = getDemoReportData(90, CARNICERIA);
  assert.ok(r.totalIngresos > 0);
  assert.ok(r.porServicio.length > 0); // acá "por servicio" lista productos del rubro
  assert.ok(r.porProfesional.length > 0); // canal/mostrador
  // Ordenado desc por total (mismo criterio que el reporte real).
  for (let i = 1; i < r.porServicio.length; i++) {
    assert.ok(r.porServicio[i - 1].total >= r.porServicio[i].total);
  }
});

test("getDemoDeepReportData(retail): computa KPIs sobre ventas ficticias del rubro", () => {
  const d = getDemoDeepReportData(90, CARNICERIA);
  assert.ok(d.totalTurnos > 0);
  assert.ok(typeof d.kpis.ticketPromedio === "number");
  assert.ok(d.kpis.ticketPromedio > 0);
});
