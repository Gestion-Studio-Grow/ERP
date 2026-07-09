// ============================================================================
// TEST de la aritmética de orden de DataTable (ADR-059 D6).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSort, ariaSortFor } from "./data-table-sort";

test("nextSort: sin orden -> asc al activar una columna", () => {
  assert.deepEqual(nextSort(null, "fecha"), { key: "fecha", direction: "asc" });
});

test("nextSort: asc -> desc en la MISMA columna", () => {
  assert.deepEqual(nextSort({ key: "fecha", direction: "asc" }, "fecha"), {
    key: "fecha",
    direction: "desc",
  });
});

test("nextSort: desc -> null (vuelve al orden original) en la MISMA columna", () => {
  assert.equal(nextSort({ key: "fecha", direction: "desc" }, "fecha"), null);
});

test("nextSort: cambiar de columna arranca SIEMPRE en asc, sin importar la dirección previa", () => {
  assert.deepEqual(nextSort({ key: "fecha", direction: "desc" }, "monto"), {
    key: "monto",
    direction: "asc",
  });
  assert.deepEqual(nextSort({ key: "fecha", direction: "asc" }, "monto"), {
    key: "monto",
    direction: "asc",
  });
});

test("nextSort: el ciclo completo de 3 pasos vuelve exactamente al punto de partida", () => {
  let s = nextSort(null, "fecha");
  s = nextSort(s, "fecha");
  s = nextSort(s, "fecha");
  assert.equal(s, null);
});

test("ariaSortFor: columna sin orden activo -> none", () => {
  assert.equal(ariaSortFor(null, "fecha"), "none");
  assert.equal(ariaSortFor({ key: "monto", direction: "asc" }, "fecha"), "none");
});

test("ariaSortFor: refleja asc/desc SOLO para la columna activa", () => {
  assert.equal(ariaSortFor({ key: "fecha", direction: "asc" }, "fecha"), "ascending");
  assert.equal(ariaSortFor({ key: "fecha", direction: "desc" }, "fecha"), "descending");
});
