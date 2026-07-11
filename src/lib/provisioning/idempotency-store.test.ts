// ============================================================================
// TESTS del STORE de idempotencia persistente (ProvisioningRun) — ADR-074 Fase 2.
// Verifica: roundtrip get/set sobre un fake de DB; y la DEGRADACIÓN a in-memory cuando la tabla no
// existe (Gate 2 sin aplicar) o la DB falla — el alta nunca se rompe por el cache.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { ProvisioningRunStore, isMissingTableError, type RawSqlRunner } from "./idempotency-store";
import { InMemoryIdempotencyStore } from "./stubs";
import type { ProvisionOutcome } from "./types";

function fakeOutcome(over: Partial<ProvisionOutcome> = {}): ProvisionOutcome {
  return {
    idempotencyKey: "console:beauty-spa",
    state: "ACTIVE",
    plan: {
      slug: "beauty-spa",
      name: "Beauty Spa",
      edicion: "comercio",
      blueprint: { id: "servicios", label: "Servicios", note: "default", matched: true },
      modules: ["agenda", "clients"],
      objects: [],
      collisions: [],
      warnings: [],
      ok: true,
    },
    commit: {
      tenantId: "tenant_beauty-spa",
      slug: "beauty-spa",
      tenantCreated: true,
      ownerCreated: true,
      settingsCreated: true,
      blueprintId: "servicios",
      catalogSeeded: true,
    },
    ...over,
  };
}

/** Fake de DB: mapea key→outcomeJson, ignorando el texto SQL (sólo prueba el roundtrip del store). */
function makeFakeDb(): RawSqlRunner & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    async $queryRawUnsafe<T>(_q: string, ...v: unknown[]): Promise<T> {
      const key = String(v[0]);
      const stored = rows.get(key);
      return (stored ? [{ outcome: stored }] : []) as T;
    },
    async $executeRawUnsafe(_q: string, ...v: unknown[]): Promise<number> {
      const key = String(v[1]);
      const outcomeJson = String(v[6]);
      rows.set(key, outcomeJson);
      return 1;
    },
  };
}

test("isMissingTableError: detecta 42P01 / 'ProvisioningRun does not exist', no otros errores", () => {
  assert.ok(isMissingTableError(new Error("db error 42P01 something")));
  assert.ok(isMissingTableError('relation "public.ProvisioningRun" does not exist'));
  assert.ok(!isMissingTableError(new Error("connection refused")));
});

test("store: set→get roundtrip sobre la tabla (fake DB)", async () => {
  const db = makeFakeDb();
  const store = new ProvisioningRunStore(db, new InMemoryIdempotencyStore());
  const outcome = fakeOutcome();
  await store.set("console:beauty-spa", outcome);
  assert.equal(db.rows.size, 1); // escribió en la tabla
  const got = await store.get("console:beauty-spa");
  assert.deepEqual(got, outcome);
});

test("store: clave inexistente → undefined", async () => {
  const store = new ProvisioningRunStore(makeFakeDb(), new InMemoryIdempotencyStore());
  assert.equal(await store.get("console:nope"), undefined);
});

test("store: tabla ausente (Gate 2 sin aplicar) → DEGRADA a in-memory, no rompe, avisa una vez", async () => {
  const missing: RawSqlRunner = {
    async $queryRawUnsafe<T>(): Promise<T> {
      throw new Error('relation "ProvisioningRun" does not exist');
    },
    async $executeRawUnsafe(): Promise<number> {
      throw new Error('relation "ProvisioningRun" does not exist');
    },
  };
  let reason = "";
  let calls = 0;
  const store = new ProvisioningRunStore(missing, new InMemoryIdempotencyStore(), (r) => {
    reason = r;
    calls++;
  });
  const outcome = fakeOutcome();
  await store.set("console:x", outcome); // no lanza (degrada al fallback)
  const got = await store.get("console:x"); // lee del fallback
  assert.deepEqual(got, outcome);
  assert.match(reason, /Gate 2/);
  assert.equal(calls, 1); // avisa una sola vez, no en cada operación
});
