// Tests de la lógica de asignación del módulo Servicios/Catálogo (variante DX-6).
// node:test + tsx.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type ProfesionalLite,
  type ServicioLite,
  diagnosticar,
  profesionalesDeServicio,
  hayAvisos,
} from "./asignacion";

function prof(id: string, serviceIds: string[], active = true): ProfesionalLite {
  return { id, name: id, active, serviceIds };
}
function svc(id: string, active = true): ServicioLite {
  return { id, name: id, active, categoryName: null };
}

test("asignación diferenciada sana: sin avisos", () => {
  const profs = [prof("caro", ["facial", "cejas"]), prof("maca", ["depilacion", "masajes"])];
  const svcs = [svc("facial"), svc("cejas"), svc("depilacion"), svc("masajes")];
  const d = diagnosticar(profs, svcs);
  assert.equal(d.asignacionUniforme, false);
  assert.equal(d.serviciosSinProfesional.length, 0);
  assert.equal(d.profesionalesSinServicio.length, 0);
  assert.equal(hayAvisos(d), false);
});

test("DETECTOR DX-6: todas las profesionales con el MISMO set ⇒ asignacionUniforme", () => {
  const set = ["depilacion", "facial"];
  const profs = [prof("caro", set), prof("maca", set), prof("romi", set)];
  const svcs = [svc("depilacion"), svc("facial")];
  const d = diagnosticar(profs, svcs);
  assert.equal(d.asignacionUniforme, true);
  assert.equal(d.profesionalesConServicios, 3);
  assert.equal(hayAvisos(d), true);
});

test("una sola profesional con servicios NO cuenta como uniforme (no hay con qué comparar)", () => {
  const profs = [prof("caro", ["facial"]), prof("maca", [])];
  const d = diagnosticar(profs, [svc("facial")]);
  assert.equal(d.asignacionUniforme, false);
});

test("orden de ids no afecta la detección de uniformidad", () => {
  const profs = [prof("a", ["x", "y"]), prof("b", ["y", "x"])];
  const d = diagnosticar(profs, [svc("x"), svc("y")]);
  assert.equal(d.asignacionUniforme, true);
});

test("servicio activo sin ninguna profesional ⇒ hueco de cobertura", () => {
  const profs = [prof("caro", ["facial"])];
  const svcs = [svc("facial"), svc("depilacion")];
  const d = diagnosticar(profs, svcs);
  assert.deepEqual(d.serviciosSinProfesional.map((s) => s.id), ["depilacion"]);
  assert.equal(hayAvisos(d), true);
});

test("servicio inactivo sin profesional NO se reporta como hueco", () => {
  const profs = [prof("caro", ["facial"])];
  const svcs = [svc("facial"), svc("viejo", false)];
  const d = diagnosticar(profs, svcs);
  assert.equal(d.serviciosSinProfesional.length, 0);
});

test("profesional activa sin servicios se reporta; inactiva no", () => {
  const profs = [prof("caro", ["facial"]), prof("nueva", []), prof("exempleada", [], false)];
  const d = diagnosticar(profs, [svc("facial")]);
  assert.deepEqual(d.profesionalesSinServicio.map((p) => p.id), ["nueva"]);
});

test("profesionalesDeServicio: lookup inverso (lado servicio del ABM)", () => {
  const profs = [prof("caro", ["facial", "cejas"]), prof("maca", ["depilacion"]), prof("romi", ["facial"])];
  assert.deepEqual(
    profesionalesDeServicio("facial", profs).map((p) => p.id),
    ["caro", "romi"],
  );
  assert.deepEqual(profesionalesDeServicio("masajes", profs), []);
});
