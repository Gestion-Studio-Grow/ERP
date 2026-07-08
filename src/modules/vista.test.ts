// Tests de la VISTA de módulos del backoffice (activar/desactivar por tenant).
// node:test + tsx. Foco: la variante (ADR-055) y el guardarraíl DX-6 aplicados al
// toggle — activar arrastra dependencias, desactivar se bloquea si algo las usa.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModuleDescriptor } from "./contract";
import { ModuleRegistry } from "./registry";
import { vistaModulos, planActivar, planDesactivar } from "./vista";

function cap(id: string, extra: Partial<ModuleDescriptor> = {}): ModuleDescriptor {
  return {
    id,
    version: "1.0.0",
    nombre: id,
    descripcion: `Módulo ${id}.`,
    kind: "capability",
    rubros: "todos",
    ...extra,
  };
}

// waitlist→agenda; commissions solo servicios (dep reports). Mismo espíritu que
// el catálogo real.
function catalogoPrueba(): ModuleRegistry {
  return new ModuleRegistry().registrarTodos([
    cap("agenda"),
    cap("catalog"),
    cap("reports"),
    cap("waitlist", { dependencias: [{ id: "agenda", rango: "^1.0" }] }),
    cap("commissions", { rubros: ["servicios"], dependencias: [{ id: "reports" }] }),
  ]);
}

test("vistaModulos: lista solo lo compatible con el rubro y marca los activos", () => {
  const r = catalogoPrueba();
  const filas = vistaModulos(
    { tenantId: "t1", blueprintId: "carniceria", modules: ["agenda"] },
    r,
  );
  const ids = filas.map((f) => f.id);
  // commissions es solo-servicios → no aparece para carnicería (variante).
  assert.ok(!ids.includes("commissions"));
  assert.ok(ids.includes("agenda") && ids.includes("catalog") && ids.includes("waitlist"));
  assert.equal(filas.find((f) => f.id === "agenda")?.activo, true);
  assert.equal(filas.find((f) => f.id === "catalog")?.activo, false);
});

test("vistaModulos: commissions sí aparece para servicios", () => {
  const r = catalogoPrueba();
  const ids = vistaModulos(
    { tenantId: "t1", blueprintId: "servicios", modules: [] },
    r,
  ).map((f) => f.id);
  assert.ok(ids.includes("commissions"));
});

test("vistaModulos: requeridoPor marca al que bloquea la desactivación", () => {
  const r = catalogoPrueba();
  const filas = vistaModulos(
    { tenantId: "t1", blueprintId: "servicios", modules: ["agenda", "waitlist"] },
    r,
  );
  // waitlist (activo) depende de agenda → agenda.requeridoPor incluye waitlist.
  assert.deepEqual(filas.find((f) => f.id === "agenda")?.requeridoPor, ["waitlist"]);
  // waitlist no bloquea a nadie.
  assert.deepEqual(filas.find((f) => f.id === "waitlist")?.requeridoPor, []);
});

test("planActivar: arrastra las dependencias en cascada", () => {
  const r = catalogoPrueba();
  const plan = planActivar([], "waitlist", r, "servicios");
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.incluidos, ["agenda"]); // agenda entró de arrastre
  assert.deepEqual(new Set(plan.modules), new Set(["waitlist", "agenda"]));
});

test("planActivar: rechaza lo incompatible con el rubro (variante), sin tocar nada", () => {
  const r = catalogoPrueba();
  const plan = planActivar(["agenda"], "commissions", r, "carniceria");
  assert.match(plan.error ?? "", /no está disponible para tu rubro/);
  assert.deepEqual(plan.modules, ["agenda"]); // intacto
});

test("planActivar: activar algo ya activo no duplica", () => {
  const r = catalogoPrueba();
  const plan = planActivar(["agenda"], "agenda", r, "servicios");
  assert.deepEqual(plan.modules, ["agenda"]);
  assert.deepEqual(plan.incluidos, []);
});

test("planDesactivar: bloquea si un módulo activo depende del que se apaga", () => {
  const r = catalogoPrueba();
  const plan = planDesactivar(["agenda", "waitlist"], "agenda", r);
  assert.match(plan.error ?? "", /No podés apagar/);
  assert.match(plan.error ?? "", /waitlist/);
  assert.deepEqual(new Set(plan.modules), new Set(["agenda", "waitlist"])); // intacto
});

test("planDesactivar: apaga limpio cuando nadie depende", () => {
  const r = catalogoPrueba();
  const plan = planDesactivar(["agenda", "waitlist"], "waitlist", r);
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.modules, ["agenda"]);
});

test("planDesactivar: apagar algo que no estaba activo es no-op", () => {
  const r = catalogoPrueba();
  const plan = planDesactivar(["agenda"], "catalog", r);
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.modules, ["agenda"]);
});
