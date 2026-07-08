// Tests del predicado PURO de gating por módulo. node:test + tsx.
// El resolver (qué queda activo) ya está testeado en activation/vista; acá solo la
// regla de visibilidad + el fail-open cuando el flag está apagado (reversibilidad).

import { test } from "node:test";
import assert from "node:assert/strict";
import { moduleGateAllows } from "./gating";

test("flag OFF (activeModules=null): deja pasar TODO — comportamiento legado", () => {
  assert.equal(moduleGateAllows("agenda", null), true);
  assert.equal(moduleGateAllows(undefined, null), true);
});

test("ítem core (sin módulo): siempre visible, aun con gating encendido", () => {
  assert.equal(moduleGateAllows(undefined, new Set(["agenda"])), true);
});

test("ítem con módulo: visible solo si el módulo está activo", () => {
  const activos = new Set(["agenda", "catalog"]);
  assert.equal(moduleGateAllows("agenda", activos), true);
  assert.equal(moduleGateAllows("clients", activos), false);
});

test("set vacío de activos: los ítems con módulo se esconden todos", () => {
  const activos = new Set<string>();
  assert.equal(moduleGateAllows("agenda", activos), false);
  assert.equal(moduleGateAllows(undefined, activos), true); // el core sobrevive
});
