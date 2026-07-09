import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionCheque,
  chequePaid,
  chequeCommitted,
  committedChequeTotal,
  clearedChequeTotal,
} from "./cheque";

// D2 (ADR-060) — cheque diferido puro, sin DB.

test("transiciones válidas del cheque", () => {
  assert.ok(canTransitionCheque("PENDING", "DELIVERED"));
  assert.ok(canTransitionCheque("PENDING", "CANCELED"));
  assert.ok(canTransitionCheque("DELIVERED", "CLEARED"));
  assert.ok(canTransitionCheque("DELIVERED", "BOUNCED"));
  assert.ok(canTransitionCheque("DELIVERED", "CANCELED"));
});

test("transiciones inválidas", () => {
  assert.equal(canTransitionCheque("PENDING", "CLEARED"), false); // hay que entregarlo primero
  assert.equal(canTransitionCheque("CLEARED", "BOUNCED"), false); // terminal
  assert.equal(canTransitionCheque("BOUNCED", "CLEARED"), false); // terminal
  assert.equal(canTransitionCheque("CANCELED", "DELIVERED"), false); // terminal
});

test("solo CLEARED pagó de verdad", () => {
  assert.equal(chequePaid("CLEARED"), true);
  for (const s of ["PENDING", "DELIVERED", "BOUNCED", "CANCELED"] as const) {
    assert.equal(chequePaid(s), false);
  }
});

test("comprometido = PENDING o DELIVERED (aún no acreditó ni se cayó)", () => {
  assert.equal(chequeCommitted("PENDING"), true);
  assert.equal(chequeCommitted("DELIVERED"), true);
  assert.equal(chequeCommitted("CLEARED"), false);
  assert.equal(chequeCommitted("BOUNCED"), false);
  assert.equal(chequeCommitted("CANCELED"), false);
});

test("committedChequeTotal suma solo los comprometidos", () => {
  const cheques = [
    { status: "PENDING" as const, amount: 1000 },
    { status: "DELIVERED" as const, amount: 2000 },
    { status: "CLEARED" as const, amount: 5000 }, // ya pagó, no es compromiso
    { status: "BOUNCED" as const, amount: 3000 }, // no cuenta
  ];
  assert.equal(committedChequeTotal(cheques), 3000);
});

test("clearedChequeTotal suma solo los acreditados", () => {
  const cheques = [
    { status: "PENDING" as const, amount: 1000 },
    { status: "CLEARED" as const, amount: 5000 },
    { status: "CLEARED" as const, amount: 2500 },
    { status: "BOUNCED" as const, amount: 3000 },
  ];
  assert.equal(clearedChequeTotal(cheques), 7500);
});

test("un cheque que rebotó NO baja el saldo (no está ni comprometido ni pagado)", () => {
  assert.equal(chequeCommitted("BOUNCED"), false);
  assert.equal(chequePaid("BOUNCED"), false);
});
