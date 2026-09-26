import { test } from "node:test";
import assert from "node:assert/strict";
import { operatorReadMustChange, operatorSetMustChange } from "./must-change-password";

// Cliente crudo falso: se le inyecta qué devuelve/lanza cada método. Sirve para probar el
// comportamiento DEFENSIVO ante la columna sin aplicar (Postgres 42703 / 42P01). La pregunta al
// catálogo («¿existe la columna?») la contesta `columna` (por defecto, sí) y queda anotada.
type Raw = Parameters<typeof operatorReadMustChange>[0];
function fakeRaw(behavior: { query?: () => unknown; exec?: () => number; columna?: boolean }): Raw & { sentencias: string[] } {
  const sentencias: string[] = [];
  return {
    sentencias,
    $queryRaw: async (q: TemplateStringsArray) => {
      if (q.join("?").includes("information_schema.columns")) {
        sentencias.push("catalogo");
        return [{ hay: behavior.columna ?? true }];
      }
      sentencias.push("select");
      return behavior.query ? behavior.query() : [];
    },
    $executeRaw: async () => {
      sentencias.push("update");
      return behavior.exec ? behavior.exec() : 1;
    },
  } as unknown as Raw & { sentencias: string[] };
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

// Forma MEDIDA con Prisma 7 + @prisma/adapter-pg (ver el comentario de isMissingColumn).
test("reconoce la columna faltante como la entrega el adaptador de Prisma 7 (P2010)", async () => {
  const { isMissingColumn } = await import("./must-change-password");
  const delAdaptador = {
    code: "P2010",
    meta: { driverAdapterError: { cause: { originalCode: "42703", kind: "ColumnNotFound", column: "mustChangePassword" } } },
  };
  assert.equal(isMissingColumn(delAdaptador), true);
  assert.equal(isMissingColumn({ code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "42P01", kind: "TableDoesNotExist" } } } }), true);
  assert.equal(isMissingColumn({ code: "42703" }), true);
  assert.equal(isMissingColumn({ code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "23505" } } } }), false);
  assert.equal(await operatorReadMustChange(fakeRaw({ query: () => { throw delAdaptador; } }), "u1"), "pendiente");
});

// Dentro de una transacción (la consola corre parada en el negocio, `enElNegocio`) una sentencia
// que falla aborta TODO lo que sigue: sin la columna no se la toca, se pregunta al catálogo.
test("sin la columna, el set no intenta el UPDATE (no aborta la transacción del reset)", async () => {
  const db = fakeRaw({ columna: false, exec: () => { throw new Error("no se tenía que ejecutar"); } });
  assert.deepEqual(await operatorSetMustChange(db, "u1", true), { persisted: false });
  assert.deepEqual(db.sentencias, ["catalogo"]);
});

test("sin la columna, la lectura dice 'pendiente' sin consultar la fila", async () => {
  const db = fakeRaw({ columna: false, query: () => { throw new Error("no se tenía que consultar"); } });
  assert.equal(await operatorReadMustChange(db, "u1"), "pendiente");
  assert.deepEqual(db.sentencias, ["catalogo"]);
});
