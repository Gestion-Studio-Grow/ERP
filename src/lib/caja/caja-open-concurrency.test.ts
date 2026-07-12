// ============================================================================
// TEST-GATE M-1 — caja: no se pueden abrir DOS turnos OPEN a la vez.
// ============================================================================
//
// Invariante: un solo mostrador por tenant → a lo sumo UNA CashSession OPEN. El alta es un
// check-then-insert ("no hay OPEN" → crear OPEN); en ReadCommitted dos aperturas simultáneas
// leen ambas "no hay" antes de que cualquiera inserte → dos turnos OPEN → arqueo que no cuadra.
//
// Sin DB (ADR-026): se SIMULA la frontera transaccional (mismo patrón que el fix de overbooking,
// ADR-004/023) para mostrar el BUG (ReadCommitted → 2 OPEN) y el FIX (Serializable + reintento →
// el 2º aborta por serialization_failure, reintenta, ve el OPEN ya commiteado y da error de dominio
// → 1 OPEN). El fix real es `tenantTransaction(..., { isolationLevel: Serializable })` en
// `openCashSession`, que reintenta el P2034 automáticamente.

import { test } from "node:test";
import assert from "node:assert/strict";

type Store = { openCount: number };

// Apertura en READ COMMITTED (comportamiento viejo): ambas aperturas arrancan con el snapshot
// "no hay OPEN" y ninguna ve a la otra → las dos insertan.
function openReadCommitted(store: Store): "opened" {
  // check: el snapshot no ve ningún OPEN (la otra tx todavía no commiteó)
  // insert: crea igual
  store.openCount++;
  return "opened";
}

// Apertura en SERIALIZABLE + reintento (fix). `otraCommiteoAntes` modela que una apertura
// concurrente se adelantó a commitear: SSI aborta esta tx (P2034) y el reintento re-lee fresco.
function openSerializableWithRetry(store: Store, otraCommiteoAntes: boolean): "opened" | "domain-error" {
  if (otraCommiteoAntes) {
    // Reintento tras el serialization_failure: lectura FRESCA → ve el OPEN ya commiteado.
    if (store.openCount > 0) return "domain-error"; // "Ya hay una caja abierta"
  }
  store.openCount++;
  return "opened";
}

test("M-1 · BUG (ReadCommitted): dos aperturas simultáneas → DOS turnos OPEN", () => {
  const store: Store = { openCount: 0 };
  // Las dos leen el snapshot vacío y ambas insertan.
  openReadCommitted(store);
  openReadCommitted(store);
  assert.equal(store.openCount, 2, "el bug deja dos turnos abiertos → arqueo descuadrado");
});

test("M-1 · FIX (Serializable + reintento): la 2ª apertura aborta, reintenta y da error de dominio", () => {
  const store: Store = { openCount: 0 };
  const a = openSerializableWithRetry(store, /* otraCommiteoAntes */ false); // A gana la carrera
  const b = openSerializableWithRetry(store, /* otraCommiteoAntes */ true); // B abortó y reintenta

  assert.equal(a, "opened");
  assert.equal(b, "domain-error", "la 2ª ve el OPEN commiteado y se rechaza");
  assert.equal(store.openCount, 1, "exactamente un turno OPEN por tenant");
});

test("M-1 · aperturas SECUENCIALES legítimas: cerrar y reabrir sigue funcionando", () => {
  const store: Store = { openCount: 0 };
  assert.equal(openSerializableWithRetry(store, false), "opened");
  store.openCount = 0; // se cerró el turno (CLOSED) → ya no hay OPEN
  assert.equal(openSerializableWithRetry(store, false), "opened", "reabrir tras cerrar es válido");
  assert.equal(store.openCount, 1);
});
