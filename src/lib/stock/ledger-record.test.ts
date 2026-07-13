// ============================================================================
// TEST-GATE I3 (ADR-064) — stock nunca negativo sin autorización.
// ============================================================================
//
// `ledger.test.ts` cubre la aritmética pura (signedDelta/round3). Esto cubre la
// ORQUESTACIÓN de `recordMovement`: la GUARDA anti-oversell real es el `updateMany`
// con `stock: { gte: -delta }` (baja condicional atómica) — si no alcanza, afecta 0
// filas, lanza y (dentro de la tx del llamador) aborta todo. Sin este test, sacar el
// `gte` o cambiarlo a `gt` no lo agarra nadie.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@/generated/prisma/client";
import { recordMovement, type LedgerTx } from "./ledger";

function makeMockTx(initialStock: number) {
  const store = { stock: initialStock };
  const movements: { type: string; qty: number; balanceAfter: number }[] = [];

  const tx = {
    product: {
      updateMany: async (args: {
        where: { stock?: { gte?: number } };
        data: { stock: { increment: number } };
      }) => {
        const gte = args.where.stock?.gte;
        // Modela la baja condicional atómica: si hay guarda `gte`, solo afecta la
        // fila si el stock actual la cumple (como el WHERE de Postgres).
        if (gte !== undefined && !(store.stock >= gte)) return { count: 0 };
        store.stock = Math.round((store.stock + args.data.stock.increment) * 1000) / 1000;
        return { count: 1 };
      },
      findUnique: async () => ({ stock: store.stock }),
    },
    stockMovement: {
      create: async (args: { data: { type: string; qty: number; balanceAfter: number } }) => {
        movements.push({ type: args.data.type, qty: args.data.qty, balanceAfter: args.data.balanceAfter });
        return {};
      },
    },
  };

  return { tx: tx as unknown as LedgerTx, store, movements };
}

const BASE = { tenantId: "t1", productId: "p1", createdBy: "user:u1" as const };

test("VENTA con stock suficiente: descuenta y registra el movimiento", async () => {
  const m = makeMockTx(10);
  const after = await recordMovement(m.tx, { ...BASE, type: "VENTA", qty: 3 });
  assert.equal(after, 7);
  assert.equal(m.store.stock, 7);
  assert.equal(m.movements.length, 1);
  assert.equal(m.movements[0].qty, -3); // delta firmado
});

test("REGRESIÓN I3 anti-oversell: VENTA sin stock suficiente LANZA y NO registra movimiento", async () => {
  const m = makeMockTx(3);
  await assert.rejects(
    () => recordMovement(m.tx, { ...BASE, type: "VENTA", qty: 5, label: "Café" }),
    /Sin stock suficiente/,
  );
  assert.equal(m.store.stock, 3, "el stock no debe moverse");
  assert.equal(m.movements.length, 0, "no debe quedar un movimiento huérfano");
});

test("allowNegative: permite dejar stock negativo (cierre de turno sin insumo cargado)", async () => {
  const m = makeMockTx(3);
  const after = await recordMovement(m.tx, { ...BASE, type: "CONSUMO", qty: 5, allowNegative: true });
  assert.equal(after, -2);
  assert.equal(m.movements.length, 1);
});

test("COMPRA (entrada): incrementa el stock", async () => {
  const m = makeMockTx(10);
  const after = await recordMovement(m.tx, { ...BASE, type: "COMPRA", qty: 4 });
  assert.equal(after, 14);
  assert.equal(m.movements[0].qty, 4);
});

test("cantidad cero: rechaza", async () => {
  const m = makeMockTx(10);
  await assert.rejects(() => recordMovement(m.tx, { ...BASE, type: "AJUSTE", qty: 0 }), /cantidad cero/);
  assert.equal(m.movements.length, 0);
});
