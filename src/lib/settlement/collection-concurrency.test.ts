import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSettlement, validateNewCollection } from "./collection";

// ============================================================================
// TEST DE CONCURRENCIA (fix del Gate de dinero) — sin DB.
// ============================================================================
//
// Reproduce el bug que marcó el Gate y prueba que el fix lo cierra, SIN tocar una base:
// modela dos transacciones que registran un cobro contra el MISMO saldo, interleavadas de
// modo que AMBAS leen el saldo ANTES de que cualquiera commitee (la condición de carrera de
// un doble-click / dos requests simultáneos). Reusa las guardas REALES de `collection.ts`
// (`computeSettlement` + `validateNewCollection`) — lo único simulado es el control de
// concurrencia de la transacción, que en prod lo da `tenantTransaction({isolationLevel:
// 'Serializable'})` + su reintento ante conflicto de serialización.

interface Store {
  total: number;
  collections: number[]; // montos ya asentados (fuente de verdad del saldo)
  version: number; // se incrementa en cada commit (proxy del snapshot serializable)
}

interface AttemptResult {
  ok: boolean;
  amount?: number;
  error?: string;
}

// Un intento de cobro: lee snapshot (montos + versión), valida contra el saldo leído y, al
// commitear, si el modelo es serializable y la versión cambió desde la lectura, REINTENTA
// re-leyendo el estado ya actualizado (lo que hace el retry de tenantTransaction). Si no es
// serializable, commitea con la lectura vieja (el bug).
function commit(
  store: Store,
  amount: number,
  readCollections: number[],
  readVersion: number,
  serializable: boolean,
  depth = 0,
): AttemptResult {
  const settlement = computeSettlement(store.total, readCollections);
  const v = validateNewCollection(amount, settlement.balance);
  if (!v.ok) return { ok: false, error: v.error };

  if (serializable && store.version !== readVersion) {
    // Conflicto de serialización → reintento re-leyendo el estado COMMITEADO actual.
    if (depth > 10) return { ok: false, error: "MAX_RETRIES" };
    return commit(store, amount, [...store.collections], store.version, serializable, depth + 1);
  }

  store.collections.push(v.amount);
  store.version += 1;
  return { ok: true, amount: v.amount };
}

// Corre dos cobros que LEEN AMBOS el mismo snapshot inicial (la carrera), luego commitea A y
// después B (que arrastra su lectura vieja). Devuelve ambos resultados y el estado final.
function raceTwo(
  store: Store,
  amtA: number,
  amtB: number,
  serializable: boolean,
): { resA: AttemptResult; resB: AttemptResult; store: Store } {
  const readVersion = store.version;
  const readA = [...store.collections];
  const readB = [...store.collections]; // B lee el MISMO snapshot que A (aún nadie commiteó)

  const resA = commit(store, amtA, readA, readVersion, serializable);
  const resB = commit(store, amtB, readB, readVersion, serializable);
  return { resA, resB, store };
}

test("BUG (no serializable): dos cobros de 700 contra saldo 1000 → ambos entran → OVERPAID", () => {
  const store: Store = { total: 1000, collections: [], version: 0 };
  const { resA, resB } = raceTwo(store, 700, 700, /* serializable */ false);

  // Ambos "ganan" leyendo el saldo viejo (1000) → se sobre-cobra.
  assert.ok(resA.ok);
  assert.ok(resB.ok);
  const final = computeSettlement(store.total, store.collections);
  assert.equal(final.status, "OVERPAID"); // ← exactamente el bug del Gate
  assert.equal(final.overpaid, 400);
});

test("FIX (serializable): dos cobros de 700 contra saldo 1000 → uno gana, el otro se rechaza, NUNCA OVERPAID", () => {
  const store: Store = { total: 1000, collections: [], version: 0 };
  const { resA, resB } = raceTwo(store, 700, 700, /* serializable */ true);

  // Uno entra; el otro re-lee el saldo ya bajado (300) y es rechazado por EXCEEDS_BALANCE.
  const oks = [resA, resB].filter((r) => r.ok);
  const rejected = [resA, resB].filter((r) => !r.ok);
  assert.equal(oks.length, 1, "exactamente un cobro debe entrar");
  assert.equal(rejected.length, 1, "el otro debe rechazarse");
  assert.equal(rejected[0].error, "EXCEEDS_BALANCE");

  const final = computeSettlement(store.total, store.collections);
  assert.notEqual(final.status, "OVERPAID");
  assert.equal(final.collected, 700);
  assert.equal(final.balance, 300);
});

test("FIX (serializable): dos parciales que SÍ caben aún tras serializar (400 + 400 sobre 1000) → ambos entran, sin sobre-cobro", () => {
  const store: Store = { total: 1000, collections: [], version: 0 };
  const { resA, resB } = raceTwo(store, 400, 400, /* serializable */ true);

  assert.ok(resA.ok);
  assert.ok(resB.ok, "el segundo re-lee saldo 600 y 400 todavía cabe");
  const final = computeSettlement(store.total, store.collections);
  assert.equal(final.collected, 800);
  assert.equal(final.balance, 200);
  assert.notEqual(final.status, "OVERPAID");
});

test("FIX (serializable): saldar exacto en carrera (600 + 400 sobre 1000) → PAID exacto, sin exceder", () => {
  const store: Store = { total: 1000, collections: [], version: 0 };
  const { resA, resB } = raceTwo(store, 600, 400, /* serializable */ true);
  assert.ok(resA.ok);
  assert.ok(resB.ok);
  const final = computeSettlement(store.total, store.collections);
  assert.equal(final.status, "PAID");
  assert.equal(final.balance, 0);
});

test("FIX (serializable): el que llega segundo a una deuda ya saldada se rechaza (no OVERPAID)", () => {
  // A saldó todo (1000). B intenta cobrar 1 con lectura vieja → re-lee saldo 0 → rechazado.
  const store: Store = { total: 1000, collections: [], version: 0 };
  const { resA, resB } = raceTwo(store, 1000, 1, /* serializable */ true);
  assert.ok(resA.ok);
  assert.equal(resB.ok, false);
  assert.equal(resB.error, "EXCEEDS_BALANCE");
  const final = computeSettlement(store.total, store.collections);
  assert.equal(final.status, "PAID");
});
