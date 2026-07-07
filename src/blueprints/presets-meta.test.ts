import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultModulesForBlueprint } from "./presets-meta";

// OP-2: la consola de operador mostraba "0 módulos" para los 4 tenants reales porque
// `Tenant.modules` nunca se persistió en el alta — no porque no tuvieran módulos. Esta
// derivación es lo que le da un número honesto sin backfillear prod.

test("familia agenda (rubro sin preset propio, p. ej. peluquería) trae los módulos de agenda", () => {
  const modules = defaultModulesForBlueprint("peluqueria");
  assert.ok(modules.includes("agenda"));
  assert.ok(modules.length > 0);
});

test("retail (magra/carniceria) deriva del rubro, no de PRESET_META", () => {
  const modules = defaultModulesForBlueprint("carniceria");
  assert.ok(modules.includes("pos"));
  assert.ok(modules.length > 0);
});

test("velas y padel (retail) también resuelven — los 3 tenants retail reales", () => {
  assert.ok(defaultModulesForBlueprint("velas").length > 0);
  assert.ok(defaultModulesForBlueprint("padel").length > 0);
});

test("'servicios' (blueprint histórico de CH) hereda el set de agenda", () => {
  const modules = defaultModulesForBlueprint("servicios");
  assert.ok(modules.includes("agenda"));
  assert.ok(modules.length > 0);
});

test("blueprint sin default conocido (p. ej. genérico) devuelve vacío, no inventa", () => {
  assert.deepEqual(defaultModulesForBlueprint("generico"), []);
});

test("blueprintId null/undefined no rompe — vacío", () => {
  assert.deepEqual(defaultModulesForBlueprint(null), []);
  assert.deepEqual(defaultModulesForBlueprint(undefined), []);
});
