// ============================================================================
// TEST-GATE A-5 — doble asiento de caja en el doble-click "Marcar cobrado".
// ============================================================================
//
// Invariante: UN solo movimiento VENTA por pedido, aunque se dispare "Marcar cobrado" dos veces
// a la vez. Sin DB (ADR-026): (1) se ejercita el cuerpo real `recordCashSaleMovementInTx` contra
// un doble que hace respetar el @@unique(tenantId,orderId,type) de A-5; (2) se SIMULA la frontera
// transaccional (dos submits que pasan el pre-check antes de que cualquiera commitee) para mostrar
// el BUG (sin unique → 2 asientos) y el FIX (unique + traducción del P2002 en el llamador → 1).

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { recordCashSaleMovementInTx, type CashSaleTx, type CashSaleInput } from "./cash-sale";
import { isUniqueViolation } from "@/lib/prisma-errors";

function p2002Cash(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.8.0",
    meta: { target: "CashMovement_tenantId_orderId_type_key" },
  });
}

// Doble de tx que hace respetar el @@unique(orderId,type) en `create` (como la DB post-migración).
// `snapshotExisting` = qué veía el pre-check al arrancar la tx (para modelar la carrera: dos tx
// ven "no existe" antes de que cualquiera cree).
function makeCashTx(store: { orderId: string; type: string }[], snapshotExisting: boolean) {
  const tx = {
    cashSession: { findFirst: async () => ({ id: "sess_1" }) },
    cashMovement: {
      findFirst: async () => (snapshotExisting ? { id: "mov_pre" } : null),
      create: async (args: { data: { orderId: string; type: string } }) => {
        if (store.some((m) => m.orderId === args.data.orderId && m.type === args.data.type)) {
          throw p2002Cash(); // el @@unique de A-5 dispara
        }
        store.push({ orderId: args.data.orderId, type: args.data.type });
        return { id: `mov_${store.length}` };
      },
    },
  };
  return tx as unknown as CashSaleTx;
}

const input = (): CashSaleInput => ({
  orderId: "ord_1",
  orderCode: 7,
  paid: true,
  paymentMethod: "EFECTIVO",
  total: 4500,
  actor: "user:u1",
});

test("A-5 · pre-check secuencial: si ya hay un VENTA para el pedido, no crea otro", async () => {
  const store = [{ orderId: "ord_1", type: "VENTA" }];
  const r = await recordCashSaleMovementInTx(makeCashTx(store, true), "t1", input());
  assert.deepEqual(r, { recorded: false, reason: "already-recorded" });
  assert.equal(store.length, 1);
});

test("A-5 · carrera: pre-check pasa pero el @@unique dispara → InTx propaga P2002 (lo traduce el llamador)", async () => {
  // El primer submit ya dejó el asiento; el segundo arrancó su tx ANTES (pre-check vio vacío).
  const store = [{ orderId: "ord_1", type: "VENTA" }]; // ya commiteado por el 1er submit
  await assert.rejects(
    recordCashSaleMovementInTx(makeCashTx(store, false), "t1", input()),
    (e: unknown) => isUniqueViolation(e, "orderId"), // el llamador lo trata como already-recorded
  );
  assert.equal(store.length, 1, "el 2º asiento NO se materializa");
});

test("A-5 · frontera: BUG(sin unique) crea 2 asientos; FIX(unique + traducción) deja 1", () => {
  // Traducción del llamador (setOrderPaid / recordCashSaleMovement): P2002 → already-recorded.
  function imputeAttempt(store: { orderId: string; type: string }[], enforceUnique: boolean, preExists: boolean) {
    if (preExists) return "already-recorded";
    const dup = store.some((m) => m.orderId === "ord_1" && m.type === "VENTA");
    if (enforceUnique && dup) return "already-recorded"; // P2002 traducido por el llamador
    store.push({ orderId: "ord_1", type: "VENTA" });
    return "recorded";
  }

  // Ambos submits pasan el pre-check (preExists=false para los dos): la carrera clásica.
  const buggy: { orderId: string; type: string }[] = [];
  imputeAttempt(buggy, false, false);
  imputeAttempt(buggy, false, false);
  assert.equal(buggy.length, 2, "BUG: sin @@unique, el doble-click deja plata de más en el arqueo");

  const fixed: { orderId: string; type: string }[] = [];
  imputeAttempt(fixed, true, false);
  const second = imputeAttempt(fixed, true, false);
  assert.equal(fixed.length, 1, "FIX: el @@unique + traducción del P2002 dejan un solo asiento");
  assert.equal(second, "already-recorded");
});
