import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboardModeForModules } from "./dashboard-mode";

// Wave B — modo del home por rubro, puro.

test("flag OFF (null) → servicios (home legado, reversible)", () => {
  assert.equal(dashboardModeForModules(null), "servicios");
});

test("mostrador: pos sin agenda → retail", () => {
  assert.equal(dashboardModeForModules(new Set(["pos", "catalog", "clients", "reports"])), "retail");
  assert.equal(dashboardModeForModules(new Set(["pos", "catalog", "clients", "reports", "arca"])), "retail");
});

test("servicios: tiene agenda → servicios (aunque tuviera pos)", () => {
  assert.equal(dashboardModeForModules(new Set(["agenda", "catalog", "clients", "waitlist", "reminders", "reports"])), "servicios");
  assert.equal(dashboardModeForModules(new Set(["agenda", "pos"])), "servicios");
});

test("sin pos ni agenda → servicios (default seguro)", () => {
  assert.equal(dashboardModeForModules(new Set(["catalog", "clients"])), "servicios");
  assert.equal(dashboardModeForModules(new Set()), "servicios");
});
