import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSettlement,
  validateNewCollection,
  isSettled,
} from "./collection";

// D9 (ADR-060) — el núcleo del cobro PARCIAL contra saldo, el hueco que marcó Opus.
// Todo PURO, sin DB.

test("origen sin cobros → UNPAID, saldo = total", () => {
  const s = computeSettlement(1000, []);
  assert.equal(s.status, "UNPAID");
  assert.equal(s.collected, 0);
  assert.equal(s.balance, 1000);
  assert.equal(s.overpaid, 0);
  assert.equal(isSettled(s), false);
});

test("cobro PARCIAL → PARTIAL, saldo baja por el cobro", () => {
  const s = computeSettlement(1000, [300]);
  assert.equal(s.status, "PARTIAL");
  assert.equal(s.collected, 300);
  assert.equal(s.balance, 700);
  assert.equal(isSettled(s), false);
});

test("varios cobros parciales que suman el total → PAID, saldo 0", () => {
  const s = computeSettlement(1000, [300, 200, 500]);
  assert.equal(s.status, "PAID");
  assert.equal(s.collected, 1000);
  assert.equal(s.balance, 0);
  assert.equal(isSettled(s), true);
});

test("cobro exacto de una → PAID", () => {
  const s = computeSettlement(1000, [1000]);
  assert.equal(s.status, "PAID");
  assert.equal(s.balance, 0);
});

test("cobrado de más → OVERPAID expone el excedente (no lo oculta)", () => {
  const s = computeSettlement(1000, [600, 600]);
  assert.equal(s.status, "OVERPAID");
  assert.equal(s.collected, 1200);
  assert.equal(s.balance, 0);
  assert.equal(s.overpaid, 200);
  assert.equal(isSettled(s), true);
});

test("total 0 con 0 cobros → PAID (no hay nada que deber)", () => {
  const s = computeSettlement(0, []);
  assert.equal(s.status, "PAID");
  assert.equal(s.balance, 0);
});

test("cent-safe: tres cobros de 33.33 y uno de 0.01 saldan 100.00 exacto", () => {
  const s = computeSettlement(100, [33.33, 33.33, 33.33, 0.01]);
  assert.equal(s.collected, 100);
  assert.equal(s.balance, 0);
  assert.equal(s.status, "PAID");
});

test("total negativo se trata como 0 (no se debe plata negativa)", () => {
  const s = computeSettlement(-50, []);
  assert.equal(s.totalCharged, 0);
  assert.equal(s.status, "PAID");
});

// --- validateNewCollection: la guarda estructural del cobro ---

test("rechaza cobro ≤ 0", () => {
  assert.deepEqual(validateNewCollection(0, 1000), { ok: false, error: "AMOUNT_NOT_POSITIVE" });
  assert.deepEqual(validateNewCollection(-10, 1000), { ok: false, error: "AMOUNT_NOT_POSITIVE" });
});

test("rechaza monto no finito (NaN/Infinity)", () => {
  assert.deepEqual(validateNewCollection(NaN, 1000), { ok: false, error: "AMOUNT_NOT_FINITE" });
  assert.deepEqual(validateNewCollection(Infinity, 1000), { ok: false, error: "AMOUNT_NOT_FINITE" });
});

test("rechaza sobre-cobro por default (cobra más que el saldo)", () => {
  assert.deepEqual(validateNewCollection(1200, 1000), { ok: false, error: "EXCEEDS_BALANCE" });
});

test("permite sobre-cobro con allowOverpay explícito", () => {
  assert.deepEqual(validateNewCollection(1200, 1000, { allowOverpay: true }), { ok: true, amount: 1200 });
});

test("acepta cobro válido dentro del saldo y devuelve el monto redondeado a 2", () => {
  assert.deepEqual(validateNewCollection(299.999, 1000), { ok: true, amount: 300 });
  assert.deepEqual(validateNewCollection(700, 700), { ok: true, amount: 700 }); // saldar exacto
});

test("flujo end-to-end de fiado: deuda 1000 se cobra en 3 veces, cada cobro válido baja el saldo", () => {
  let s = computeSettlement(1000, []);
  const cobros: number[] = [];
  for (const intento of [400, 400, 200]) {
    const v = validateNewCollection(intento, s.balance);
    assert.ok(v.ok, `cobro de ${intento} contra saldo ${s.balance} debería ser válido`);
    if (v.ok) cobros.push(v.amount);
    s = computeSettlement(1000, cobros);
  }
  assert.equal(s.status, "PAID");
  assert.equal(s.balance, 0);
  // Un 4º cobro ya no entra: saldo 0.
  assert.deepEqual(validateNewCollection(1, s.balance), { ok: false, error: "EXCEEDS_BALANCE" });
});
