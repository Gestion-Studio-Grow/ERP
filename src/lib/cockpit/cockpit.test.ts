// Tests de la lógica pura del cockpit (salud + plan). node:test + tsx. Read-only,
// sin DB: todo deriva de metadata/datos.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type TenantMeta,
  estadoDeTenant,
  resumenSalud,
  peorEstado,
  saludComponentes,
  estadoNeon,
  NEON_EN_PAUSA,
} from "./salud";
import {
  PLAN_REINGENIERIA,
  resumenPlan,
  resumenAlertas,
  ALERTAS_CRITICAS,
} from "./plan";
import { cockpitNavEnabled, cockpitNeonEnabled } from "./flag";

const meta = (over: Partial<TenantMeta>): TenantMeta => ({
  id: "t", name: "T", slug: "t", status: "ACTIVE", subdomain: "t", ...over,
});

// ── Salud de tenants ─────────────────────────────────────────────────────────

test("estadoDeTenant: activo con URL = sano", () => {
  assert.equal(estadoDeTenant(meta({})).estado, "sano");
});

test("estadoDeTenant: suspendido = caído", () => {
  assert.equal(estadoDeTenant(meta({ status: "SUSPENDED" })).estado, "caido");
});

test("estadoDeTenant: en pruebas = atención", () => {
  assert.equal(estadoDeTenant(meta({ status: "TRIAL" })).estado, "atencion");
});

test("estadoDeTenant: activo sin URL publicada = atención", () => {
  assert.equal(estadoDeTenant(meta({ subdomain: null })).estado, "atencion");
});

test("peorEstado: gana el más severo", () => {
  assert.equal(peorEstado(["sano", "atencion", "sano"]), "atencion");
  assert.equal(peorEstado(["sano", "caido", "atencion"]), "caido");
  assert.equal(peorEstado([]), "sano");
});

test("resumenSalud: cuenta por estado + peor", () => {
  const tenants = [
    estadoDeTenant(meta({ id: "a" })),
    estadoDeTenant(meta({ id: "b", status: "TRIAL" })),
    estadoDeTenant(meta({ id: "c", status: "SUSPENDED" })),
  ];
  const r = resumenSalud(tenants);
  assert.deepEqual([r.total, r.sanos, r.atencion, r.caidos], [3, 1, 1, 1]);
  assert.equal(r.peor, "caido");
});

// ── Salud de componentes ─────────────────────────────────────────────────────

test("saludComponentes: DB caída y plugins en stub", () => {
  const comps = saludComponentes({
    dbOk: false, rlsEnforced: true, modoArca: "stub", modoMp: "stub", whatsappVivo: false,
  });
  const byId = Object.fromEntries(comps.map((c) => [c.id, c.estado]));
  assert.equal(byId.db, "caido");
  assert.equal(byId.arca, "atencion");
  assert.equal(byId.mp, "atencion");
  assert.equal(byId.rls, "sano");
  assert.equal(byId.whatsapp, "atencion");
  assert.equal(byId.app, "sano");
});

test("saludComponentes: todo real y sano", () => {
  const comps = saludComponentes({
    dbOk: true, rlsEnforced: true, modoArca: "real", modoMp: "real", whatsappVivo: true,
  });
  assert.ok(comps.every((c) => c.estado === "sano"));
});

// ── Snapshot Neon ────────────────────────────────────────────────────────────

test("estadoNeon: dentro de rango = sano", () => {
  assert.equal(estadoNeon({ conexiones: 10, latenciaMs: 40, locks: 0 }).estado, "sano");
});

test("estadoNeon: latencia/locks altos = atención", () => {
  assert.equal(estadoNeon({ conexiones: 10, latenciaMs: 800, locks: 0 }).estado, "atencion");
  assert.equal(estadoNeon({ conexiones: 10, latenciaMs: 40, locks: 9 }).estado, "atencion");
});

test("estadoNeon: latencia muy alta o muchas conexiones = caído", () => {
  assert.equal(estadoNeon({ conexiones: 10, latenciaMs: 2500, locks: 0 }).estado, "caido");
  assert.equal(estadoNeon({ conexiones: 200, latenciaMs: 40, locks: 0 }).estado, "caido");
});

test("NEON_EN_PAUSA: default sin números", () => {
  assert.equal(NEON_EN_PAUSA.estado, "en_pausa");
  assert.equal(NEON_EN_PAUSA.conexiones, null);
});

// ── Plan / alertas ───────────────────────────────────────────────────────────

test("resumenPlan: T1–T3 hechas, T4 en curso", () => {
  const r = resumenPlan();
  assert.equal(r.total, PLAN_REINGENIERIA.length);
  assert.equal(r.hechas, 3);
  assert.equal(r.enCurso, 1);
  assert.ok(r.pctHecho > 0 && r.pctHecho < 100);
});

test("plan: ids únicos y T4 en-curso", () => {
  const ids = PLAN_REINGENIERIA.map((t) => t.id);
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(PLAN_REINGENIERIA.find((t) => t.id === "T4")?.estado, "en-curso");
});

test("resumenAlertas: cuenta rojas y amarillas", () => {
  const r = resumenAlertas();
  assert.equal(r.rojas + r.amarillas, ALERTAS_CRITICAS.length);
  assert.ok(r.rojas >= 1);
});

// ── Flags ────────────────────────────────────────────────────────────────────

test("flags: default OFF, se prenden con valores esperados", () => {
  assert.equal(cockpitNavEnabled({}), false);
  assert.equal(cockpitNavEnabled({ COCKPIT_ENABLED: "on" }), true);
  assert.equal(cockpitNeonEnabled({}), false);
  assert.equal(cockpitNeonEnabled({ COCKPIT_NEON: "1" }), true);
});
