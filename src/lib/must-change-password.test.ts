import { test } from "node:test";
import assert from "node:assert/strict";
import { operatorReadMustChange, operatorSetMustChange } from "./must-change-password";

// Cliente crudo falso: se le inyecta qué devuelve/lanza cada método. Sirve para probar el
// comportamiento DEFENSIVO ante la columna sin aplicar (Postgres 42703 / 42P01).
type Raw = Parameters<typeof operatorReadMustChange>[0];
function fakeRaw(behavior: { query?: () => unknown; exec?: () => number }): Raw {
  return {
    $queryRaw: async () => (behavior.query ? behavior.query() : []),
    $executeRaw: async () => (behavior.exec ? behavior.exec() : 1),
  } as unknown as Raw;
}
function pgError(code: string) {
  const e = new Error(`pg ${code}`) as Error & { code: string };
  e.code = code;
  return e;
}

// --- operatorReadMustChange --------------------------------------------------

test("lee true cuando la fila tiene el flag en true", async () => {
  const db = fakeRaw({ query: () => [{ mustChangePassword: true }] });
  assert.equal(await operatorReadMustChange(db, "u1"), true);
});

test("lee false cuando el flag es false o no hay fila", async () => {
  assert.equal(await operatorReadMustChange(fakeRaw({ query: () => [{ mustChangePassword: false }] }), "u1"), false);
  assert.equal(await operatorReadMustChange(fakeRaw({ query: () => [] }), "u1"), false);
});

test("columna inexistente (42703) → 'pendiente' en vez de romper", async () => {
  const db = fakeRaw({ query: () => { throw pgError("42703"); } });
  assert.equal(await operatorReadMustChange(db, "u1"), "pendiente");
});

test("tabla inexistente (42P01) → 'pendiente'", async () => {
  const db = fakeRaw({ query: () => { throw pgError("42P01"); } });
  assert.equal(await operatorReadMustChange(db, "u1"), "pendiente");
});

test("un error que NO es columna-faltante se propaga (no se traga)", async () => {
  const db = fakeRaw({ query: () => { throw pgError("08006"); } });
  await assert.rejects(() => operatorReadMustChange(db, "u1"), /08006/);
});

// --- operatorSetMustChange ---------------------------------------------------

test("set OK → persisted:true", async () => {
  assert.deepEqual(await operatorSetMustChange(fakeRaw({ exec: () => 1 }), "u1", true), { persisted: true });
});

test("set con columna inexistente → persisted:false (no rompe)", async () => {
  const db = fakeRaw({ exec: () => { throw pgError("42703"); } });
  assert.deepEqual(await operatorSetMustChange(db, "u1", true), { persisted: false });
});

test("set con error real se propaga", async () => {
  const db = fakeRaw({ exec: () => { throw pgError("23505"); } });
  await assert.rejects(() => operatorSetMustChange(db, "u1", true), /23505/);
});
