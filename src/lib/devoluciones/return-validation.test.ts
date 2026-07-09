import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReturnLine, hasValidReturnLine } from "./return-validation";

test("validateReturnLine: cantidad válida dentro de lo comprado", () => {
  const r = validateReturnLine(3, 10);
  assert.deepEqual(r, { ok: true, qty: 3 });
});

test("validateReturnLine: no finita / ≤ 0 / mayor a lo comprado → error", () => {
  assert.equal((validateReturnLine(NaN, 10) as { error: string }).error, "QTY_NOT_FINITE");
  assert.equal((validateReturnLine(0, 10) as { error: string }).error, "QTY_NOT_POSITIVE");
  assert.equal((validateReturnLine(-1, 10) as { error: string }).error, "QTY_NOT_POSITIVE");
  assert.equal((validateReturnLine(11, 10) as { error: string }).error, "EXCEEDS_PURCHASED");
});

test("validateReturnLine: igual a lo comprado es válido (devolución total)", () => {
  assert.deepEqual(validateReturnLine(10, 10), { ok: true, qty: 10 });
});

test("validateReturnLine: redondea a 2 (kg)", () => {
  const r = validateReturnLine(1.005, 5);
  assert.equal((r as { qty: number }).qty, 1.01);
});

test("hasValidReturnLine: true si alguna línea es válida", () => {
  assert.equal(hasValidReturnLine([{ qty: 0, purchased: 10 }, { qty: 2, purchased: 5 }]), true);
  assert.equal(hasValidReturnLine([{ qty: 0, purchased: 10 }, { qty: 99, purchased: 5 }]), false);
  assert.equal(hasValidReturnLine([]), false);
});
