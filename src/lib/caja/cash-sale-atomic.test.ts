// ============================================================================
// TEST-GATE I7 (ADR-064) — venta al contado ATÓMICA con caja (orden+stock+caja todo-o-nada).
// ============================================================================
//
// Invariante: una venta al contado no queda a medias. El asiento de caja de una venta en
// efectivo se hace DENTRO de la MISMA transacción que la orden (+stock) → si algo falla, no
// queda ni la venta sin su movimiento de caja (arqueo con faltante) ni un movimiento huérfano.
//
// Dos frentes, sin DB (ADR-026):
//  1) UNIT del cuerpo tx-scoped REAL (`recordCashSaleMovementInTx`) contra un doble de test:
//     elegibilidad, sesión abierta, idempotencia por orderId. (La decisión pura de elegibilidad
//     ya está cubierta en `cash-sale.test.ts`.)
//  2) SIMULACIÓN de la frontera transaccional (patrón collection-concurrency): se modela el BUG
//     (caja en 2ª tx separada → venta cobrada sin movimiento) y el FIX (una sola tx → o todo o
//     nada), y se afirma que solo el FIX mantiene el arqueo consistente ante un fallo de caja.

import { test } from "node:test";
import assert from "node:assert/strict";
import { recordCashSaleMovementInTx, type CashSaleTx, type CashSaleInput } from "./cash-sale";

// --- Doble de test para la variante tx-scoped real. ---

function makeCashTx(opts: { openSession: boolean; preexistingOrderId?: string }) {
  const movements: { id: string; orderId: string; type: string; amount: number }[] = [];
  let seq = 0;
  if (opts.preexistingOrderId) {
    movements.push({ id: "mov_pre", orderId: opts.preexistingOrderId, type: "VENTA", amount: 1 });
  }
  const tx = {
    cashSession: {
      findFirst: async () => (opts.openSession ? { id: "sess_1" } : null),
    },
    cashMovement: {
      findFirst: async (args: { where: { orderId: string; type: string } }) => {
        const m = movements.find((x) => x.orderId === args.where.orderId && x.type === args.where.type);
        return m ? { id: m.id } : null;
      },
      create: async (args: { data: { orderId: string; type: string; amount: number } }) => {
        const m = { id: `mov_${++seq}`, orderId: args.data.orderId, type: args.data.type, amount: args.data.amount };
        movements.push(m);
        return { id: m.id };
      },
    },
  };
  return { tx: tx as unknown as CashSaleTx, movements };
}

const cashInput = (over: Partial<CashSaleInput> = {}): CashSaleInput => ({
  orderId: "ord_1",
  orderCode: 7,
  paid: true,
  paymentMethod: "EFECTIVO",
  total: 4500,
  actor: "user:u1",
  ...over,
});

test("I7 · venta efectivo con caja abierta → asienta el movimiento en la tx del llamador", async () => {
  const { tx, movements } = makeCashTx({ openSession: true });
  const r = await recordCashSaleMovementInTx(tx, "t1", cashInput());
  assert.equal(r.recorded, true);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].amount, 4500);
});

test("I7 · sin caja abierta → NO asienta y NO lanza (la venta se concreta igual): benigno", async () => {
  const { tx, movements } = makeCashTx({ openSession: false });
  const r = await recordCashSaleMovementInTx(tx, "t1", cashInput());
  assert.deepEqual(r, { recorded: false, reason: "no-open-session" });
  assert.equal(movements.length, 0);
});

test("I7 · idempotencia por orderId: si ya se imputó, no duplica", async () => {
  const { tx, movements } = makeCashTx({ openSession: true, preexistingOrderId: "ord_1" });
  const r = await recordCashSaleMovementInTx(tx, "t1", cashInput({ orderId: "ord_1" }));
  assert.deepEqual(r, { recorded: false, reason: "already-recorded" });
  assert.equal(movements.length, 1, "sigue habiendo un solo movimiento (el preexistente)");
});

test("I7 · no efectivo (MP) → benigno, sin movimiento de caja", async () => {
  const { tx, movements } = makeCashTx({ openSession: true });
  const r = await recordCashSaleMovementInTx(tx, "t1", cashInput({ paymentMethod: "MERCADOPAGO" }));
  assert.deepEqual(r, { recorded: false, reason: "not-cash" });
  assert.equal(movements.length, 0);
});

// --- Simulación de la FRONTERA transaccional (bug de 2ª-tx vs fix de 1-tx). ---
//
// Modela el estado persistido de una venta al contado. `arqueoConsistente` = "no hay una venta
// cobrada en efectivo sin su movimiento de caja" (la condición que el arqueo de cierre necesita).

interface SaleStore {
  order: { id: string; paid: boolean } | null; // la venta cobrada (persistida o no)
  cashMovements: string[]; // orderIds con movimiento de caja asentado
}

function arqueoConsistente(store: SaleStore): boolean {
  // Inconsistente si la venta quedó cobrada en efectivo pero NO tiene su movimiento de caja.
  if (store.order?.paid && !store.cashMovements.includes(store.order.id)) return false;
  return true;
}

// BUG (hoy): orden en tx1 (commitea), caja en tx2 (separada, best-effort). Si tx2 falla DESPUÉS
// de que tx1 commiteó, queda la venta cobrada sin movimiento → arqueo con faltante.
function sellSeparateTx(store: SaleStore, injectCashFail: boolean): void {
  // tx1: crea/commitea la venta cobrada
  store.order = { id: "ord_1", paid: true };
  // tx2 (separada): asienta la caja
  if (injectCashFail) return; // la 2ª tx falló → NO se revierte la venta ya commiteada
  store.cashMovements.push("ord_1");
}

// FIX (I7): orden + caja en UNA sola tx. Si el asiento de caja falla, se revierte TODO (buffer
// que solo se aplica al store si la tx entera tuvo éxito).
function sellAtomic(store: SaleStore, injectCashFail: boolean): void {
  const buffered: SaleStore = { order: { id: "ord_1", paid: true }, cashMovements: ["ord_1"] };
  if (injectCashFail) return; // la tx aborta → NADA se aplica al store (rollback total)
  store.order = buffered.order;
  store.cashMovements.push(...buffered.cashMovements);
}

test("I7 · BUG (caja en 2ª tx): un fallo de caja deja la venta cobrada SIN movimiento → arqueo descuadra", () => {
  const store: SaleStore = { order: null, cashMovements: [] };
  sellSeparateTx(store, /* injectCashFail */ true);
  assert.equal(store.order?.paid, true, "la venta quedó cobrada (tx1 commiteó)");
  assert.equal(store.cashMovements.length, 0, "pero sin movimiento de caja (tx2 falló)");
  assert.equal(arqueoConsistente(store), false, "← exactamente el descuadre que I7 prohíbe");
});

test("I7 · FIX (una sola tx): un fallo de caja revierte TODA la venta → no queda estado parcial", () => {
  const store: SaleStore = { order: null, cashMovements: [] };
  sellAtomic(store, /* injectCashFail */ true);
  assert.equal(store.order, null, "la venta NO quedó cobrada (rollback total)");
  assert.equal(store.cashMovements.length, 0, "ni movimiento de caja huérfano");
  assert.equal(arqueoConsistente(store), true, "arqueo consistente: no hay venta a medias");
});

test("I7 · FIX (una sola tx): venta OK → orden y movimiento de caja quedan JUNTOS", () => {
  const store: SaleStore = { order: null, cashMovements: [] };
  sellAtomic(store, /* injectCashFail */ false);
  assert.equal(store.order?.paid, true);
  assert.deepEqual(store.cashMovements, ["ord_1"]);
  assert.equal(arqueoConsistente(store), true);
});
