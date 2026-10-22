// M-050 (B8): «Clases de pádel» se asigna SÓLO al rubro profe-padel (ADR-055, nunca «a todos
// con todo»). `padel` a secas es la TIENDA (A Dos Manos): no lleva turnero de profe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { padelClasesModule } from "./padel-clases";
import { validarDescriptor } from "../contract";
import { rubroCompatible } from "../registry";
import { defaultModulesForBlueprint } from "@/blueprints/presets-meta";

test("el descriptor declara rubros [\"profe-padel\"] y valida sin errores", () => {
  assert.deepEqual(padelClasesModule.rubros, ["profe-padel"]);
  assert.deepEqual(validarDescriptor(padelClasesModule).filter((p) => p.severidad === "error"), []);
});

test("sólo es asignable al rubro profe-padel", () => {
  assert.equal(rubroCompatible(padelClasesModule.rubros, "profe-padel"), true);
  for (const otro of ["padel", "servicios", "carniceria", "", null, undefined]) {
    assert.equal(rubroCompatible(padelClasesModule.rubros, otro), false, `no debería ser asignable a ${String(otro)}`);
  }
  // El alta del profe sigue prendiéndolo por defecto: el rubro que lo trae es el único compatible.
  assert.ok(defaultModulesForBlueprint("profe-padel").includes("padel-clases"));
});
