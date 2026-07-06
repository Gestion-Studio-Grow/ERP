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
  DEMO_CAJA_DATA,
  getDemoAgendaDay,
  getDemoReportData,
  getDemoDeepReportData,
  getDemoOwnerPanelData,
} from "./demo-sandbox";

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

test("DEMO_CAJA_DATA: caja abierta con ledger coherente", () => {
  assert.ok(DEMO_CAJA_DATA.open);
  assert.ok(DEMO_CAJA_DATA.open.movements.length >= 1);
  assert.equal(DEMO_CAJA_DATA.open.movements[0].type, "APERTURA");
  assert.ok(DEMO_CAJA_DATA.recentClosed.length >= 1);
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
