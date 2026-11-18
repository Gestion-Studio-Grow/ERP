// GSG-MIA-088 · las reglas puras nuevas de gestion-core (PRY-100, ADM-134, ADM-135). Lo de punta a punta, con Postgres y
// app_rls, está en mia088-permisos-postgres.test.ts y mia088-rendiciones-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cambiaLosPermisos, motivoSinRendiciones, pagaLiquidaciones, revisaRendiciones, ROLES_GESTION } from "./gestion-core";

const E = { ver: true, editar: true };
const V = { ver: true, editar: false };
const N = { ver: false, editar: false };

test("PRY-100 · la matriz la cambia sólo Dirección (la dueña sin ficha entra como Dirección)", () => {
  assert.deepEqual(ROLES_GESTION.filter(cambiaLosPermisos), ["DIRECCION"]);
  assert.equal(cambiaLosPermisos("SIN_FICHA"), false);
});

test("ADM-134 · Rendiciones: «ver» rinde, «editar» revisa; sin acceso, nada", () => {
  assert.equal(motivoSinRendiciones(V, "rendir"), null);
  assert.equal(motivoSinRendiciones(E, "revisar"), null);
  assert.match(motivoSinRendiciones(N, "rendir") ?? "", /Rendiciones/);
  assert.match(motivoSinRendiciones(V, "revisar") ?? "", /«editar»/);
  assert.equal(revisaRendiciones("ADMINISTRACION", E), true);
  assert.equal(revisaRendiciones("ADMINISTRACION", V), false, "el rol solo no alcanza");
  assert.equal(revisaRendiciones("PRODUCCION", E), false, "la matriz sola no alcanza");
});

test("ADM-135 · «Pagar liquidación» con la misma regla que el servidor: el rol y liquidaciones en «editar»", () => {
  assert.equal(pagaLiquidaciones("DIRECCION", E), true);
  assert.equal(pagaLiquidaciones("ADMINISTRACION", V), false);
  assert.equal(pagaLiquidaciones("COMERCIAL", E), false);
});
