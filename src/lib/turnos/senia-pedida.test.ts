import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCION_SENIA_PEDIDA, ultimaSeniaPedida } from "./senia-pedida";

test("la marca se llama como la lee la agenda", () => {
  assert.equal(ACCION_SENIA_PEDIDA, "deposit_requested");
});

test("de varias filas, la última vez que se pidió la seña de cada turno; sin turno, nada", () => {
  const r = ultimaSeniaPedida([
    { entityId: "t1", createdAt: new Date("2026-10-20T10:00:00.000Z") },
    { entityId: "t1", createdAt: "2026-10-21T10:00:00.000Z" },
    { entityId: "t2", createdAt: new Date("2026-10-19T10:00:00.000Z") },
    { entityId: null, createdAt: new Date("2026-10-22T10:00:00.000Z") },
  ]);
  assert.deepEqual(r, { t1: "2026-10-21T10:00:00.000Z", t2: "2026-10-19T10:00:00.000Z" });
});
