import { test } from "node:test";
import assert from "node:assert/strict";
import { validateReturnLine, hasValidReturnLine, remainingReturnable } from "./return-validation";

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

// ── A-4 · Sobre-devolución a proveedor ─────────────────────────────────────
// Repro: de una compra de 10 kg se devuelven 8, y después se intentan devolver otros 8.
// El tope de la 2ª devolución debe ser comprado − ya_devuelto = 10 − 8 = 2, no 10.

test("remainingReturnable: comprado − ya_devuelto, clamp a 0", () => {
  assert.equal(remainingReturnable(10, 0), 10);
  assert.equal(remainingReturnable(10, 8), 2);
  assert.equal(remainingReturnable(10, 10), 0); // ya se devolvió todo
  assert.equal(remainingReturnable(10, 16), 0); // nunca negativo
  assert.equal(remainingReturnable(1.5, 0.75), 0.75); // kg con fracción
});

test("A-4 BUG(antes): validar contra lo comprado a secas deja pasar la sobre-devolución", () => {
  // Comportamiento VIEJO: el tope era `item.quantity` (10), ignorando lo ya devuelto.
  // Segunda devolución de 8 sobre una compra de 10 con 8 ya devueltos → pasaba (10+ acumulado).
  const capViejo = 10; // item.quantity
  assert.equal(validateReturnLine(8, capViejo).ok, true); // ← el bug: la 2ª de 8 pasaba
});

test("A-4 FIX(después): el tope resta lo ya devuelto → la 2ª de 8 se rechaza", () => {
  const comprado = 10;
  const yaDevuelto = 8; // primera devolución ya asentada
  const cap = remainingReturnable(comprado, yaDevuelto); // = 2
  const r = validateReturnLine(8, cap);
  assert.equal(r.ok, false);
  assert.equal((r as { error: string }).error, "EXCEEDS_PURCHASED");
  // Y una 2ª devolución dentro del saldo (2) sí se acepta.
  assert.deepEqual(validateReturnLine(2, cap), { ok: true, qty: 2 });
});
