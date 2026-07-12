// ============================================================================
// TEST-GATE A-1 (idempotencia del alta de vidriera) + A-2 (colisión de correlativo).
// ============================================================================
//
// Sin DB (ADR-026): se testea la ORQUESTACIÓN real (`insertOrderGuarded`) inyectando
// `findByKey` / `runInsert` y los predicados de error. Se modela la frontera transaccional:
//  - A-1: dos envíos con la MISMA clave (doble-submit del mobile) → UN solo pedido.
//  - A-2: el correlativo `max(code)+1` choca bajo concurrencia → se reintenta con otro code,
//         nunca el 500 que veía el 2º cliente simultáneo.
//  - Tolerancia schema-ahead: si la columna de idempotencia no está migrada, el alta NO se rompe.

import { test } from "node:test";
import assert from "node:assert/strict";
import { insertOrderGuarded, type InsertedOrder } from "./order-core";

// Errores-doble: el kind los distingue (en prod son P2002/P2022 reales, ver prisma-errors.test.ts).
class FakeErr extends Error {
  constructor(public kind: "code" | "key" | "missingKey" | "other") {
    super(kind);
  }
}
const preds = {
  isCodeConflict: (e: unknown) => e instanceof FakeErr && e.kind === "code",
  isKeyConflict: (e: unknown) => e instanceof FakeErr && e.kind === "key",
  isMissingKeyColumn: (e: unknown) => e instanceof FakeErr && e.kind === "missingKey",
};

const base = { subtotal: 1000, lineCount: 2, ...preds };

test("A-1 · camino rápido: si ya existe un pedido con la clave, se devuelve sin crear otro", async () => {
  const prior: InsertedOrder = { id: "ord_prev", code: 7, subtotal: 1000, lines: 2, dedup: true };
  let inserts = 0;
  const r = await insertOrderGuarded({
    ...base,
    idempotencyKey: "k1",
    findByKey: async () => prior,
    runInsert: async () => {
      inserts++;
      return { id: "NUEVO", code: 99 };
    },
  });
  assert.equal(r.id, "ord_prev");
  assert.equal(r.dedup, true);
  assert.equal(inserts, 0, "no debe crear un pedido nuevo si la clave ya existe");
});

test("A-1 · carrera: el 2º submit choca el unique de la clave → devuelve el pedido ganador", async () => {
  // 1ª lectura: no existe (ambos pasan el camino rápido). El insert choca el unique de la clave.
  // 2ª lectura (tras el choque): ya está el ganador del otro submit → se devuelve, sin 2º pedido.
  const calls: string[] = [];
  const winner: InsertedOrder = { id: "ord_win", code: 12, subtotal: 1000, lines: 2, dedup: true };
  let findCall = 0;
  let inserts = 0;
  const r = await insertOrderGuarded({
    ...base,
    idempotencyKey: "k2",
    findByKey: async () => {
      findCall++;
      calls.push(`find#${findCall}`);
      return findCall === 1 ? null : winner;
    },
    runInsert: async () => {
      inserts++;
      calls.push("insert");
      throw new FakeErr("key");
    },
  });
  assert.equal(r.id, "ord_win");
  assert.equal(inserts, 1, "el insert se intenta una sola vez; el choque no reintenta a ciegas");
  assert.deepEqual(calls, ["find#1", "insert", "find#2"]);
});

test("A-1 · schema-ahead: columna no migrada (P2022) → reintenta SIN la clave y crea igual", async () => {
  const seenWriteKeys: (string | null)[] = [];
  const r = await insertOrderGuarded({
    ...base,
    idempotencyKey: "k3",
    findByKey: async () => null,
    runInsert: async (writeKey) => {
      seenWriteKeys.push(writeKey);
      if (writeKey !== null) throw new FakeErr("missingKey"); // 1er intento con clave → columna ausente
      return { id: "ord_new", code: 3 }; // 2º intento sin clave → OK (comportamiento de hoy)
    },
  });
  assert.equal(r.id, "ord_new");
  assert.deepEqual(seenWriteKeys, ["k3", null], "cae de la clave a null y reintenta sin ella");
});

test("A-2 · colisión de correlativo: reintenta recomputando el code (no explota con 500)", async () => {
  // Modela dos altas concurrentes: la 1ª ya tomó el code N; esta choca 2 veces y a la 3ª toma N+…
  let nextCode = 5;
  let attempts = 0;
  const r = await insertOrderGuarded({
    ...base,
    idempotencyKey: null,
    findByKey: async () => null,
    runInsert: async () => {
      attempts++;
      if (attempts <= 2) throw new FakeErr("code"); // dos choques de correlativo
      return { id: "ord_ok", code: nextCode++ };
    },
  });
  assert.equal(r.id, "ord_ok");
  assert.equal(attempts, 3, "reintentó hasta conseguir un correlativo libre");
});

test("A-2 · el reintento de correlativo es ACOTADO (no gira en falso)", async () => {
  let attempts = 0;
  await assert.rejects(
    insertOrderGuarded({
      ...base,
      idempotencyKey: null,
      maxCodeRetries: 3,
      findByKey: async () => null,
      runInsert: async () => {
        attempts++;
        throw new FakeErr("code"); // choca siempre
      },
    }),
    (e: unknown) => e instanceof FakeErr && e.kind === "code",
  );
  assert.equal(attempts, 4, "1 intento inicial + 3 reintentos, después propaga");
});

test("un error ajeno (ni code ni key) se propaga sin reintentar", async () => {
  let attempts = 0;
  await assert.rejects(
    insertOrderGuarded({
      ...base,
      idempotencyKey: null,
      findByKey: async () => null,
      runInsert: async () => {
        attempts++;
        throw new FakeErr("other");
      },
    }),
    (e: unknown) => e instanceof FakeErr && e.kind === "other",
  );
  assert.equal(attempts, 1);
});

test("happy path: alta directa sin clave → devuelve el pedido creado", async () => {
  const r = await insertOrderGuarded({
    ...base,
    idempotencyKey: null,
    findByKey: async () => null,
    runInsert: async () => ({ id: "ord_h", code: 1, cashSale: { recorded: false, reason: "not-cash" } }),
  });
  assert.equal(r.id, "ord_h");
  assert.equal(r.code, 1);
  assert.equal(r.subtotal, 1000);
  assert.equal(r.lines, 2);
});
