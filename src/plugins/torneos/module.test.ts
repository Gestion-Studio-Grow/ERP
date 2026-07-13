// El descriptor de torneos "encaja en el catálogo" (ADR-097): valida en verde con la
// misma validación pura que corre el ModuleRegistry (ADR-054), sin cablearlo al catálogo
// vivo. Es la prueba de que el molde es catalog-ready (FASE 1/2) antes de instanciarlo
// (FASE 3). Evita el antipatrón MP-13 al revés: no contamos "consumido" lo que no lo está,
// pero sí probamos que el descriptor es válido.
import { test } from "node:test";
import assert from "node:assert/strict";

import { validarDescriptor } from "@/modules/contract";
import { torneosModule, BLUEPRINT_TORNEOS } from "./module";

test("torneosModule pasa validarDescriptor sin errores ni avisos", () => {
  const problemas = validarDescriptor(torneosModule);
  assert.deepEqual(
    problemas,
    [],
    "el descriptor de torneos debe validar limpio: " + JSON.stringify(problemas),
  );
});

test("torneosModule es un vertical de primera parte (capability), no una integración", () => {
  assert.equal(torneosModule.kind, "capability");
  // Compatible SOLO con el blueprint torneos (variante, no 'todos').
  assert.deepEqual(torneosModule.rubros, [BLUEPRINT_TORNEOS]);
});

test("torneosModule declara su migración Gate 2 como aditiva y su flag de rollout", () => {
  assert.equal(torneosModule.flag, "TORNEOS_ENABLED");
  assert.ok(torneosModule.migraciones?.every((m) => m.aditiva === true));
  assert.ok(
    torneosModule.migraciones?.some((m) => m.carpeta.includes("pending-gate2/Torneo.sql")),
  );
});
