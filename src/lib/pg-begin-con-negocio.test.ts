// El empaquetado del BEGIN con el negocio (pg-begin-con-negocio.ts), con una conexión FALSA que
// anota qué sale a la red. Lo que se prueba es la decisión: qué se junta, qué no, en qué orden
// sale todo y qué pasa cuando algo falla. Contra Postgres de verdad (rol app_rls, RLS):
// pg-begin-con-negocio-postgres.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { instalarBeginConNegocio, instalarEnPool, type ConexionPg } from "./pg-begin-con-negocio";

const GUC = "SELECT set_config('app.current_tenant_id', $1, true)";
const ID = "cmrhv1kwk0018ww7dsn4r2df2";

type Salida = { texto: string; valores?: unknown[] };

/** Conexión falsa: contesta en orden, anota lo que sale y puede fallar a pedido. */
function conexionFalsa(opciones: { fallaSi?: (texto: string) => boolean } = {}) {
  const salidas: Salida[] = [];
  const c: ConexionPg = {
    query(config: unknown, values?: unknown) {
      const texto = typeof config === "string" ? config : String((config as { text?: string }).text);
      const valores = Array.isArray(values) ? values : (config as { values?: unknown[] })?.values;
      salidas.push({ texto, ...(valores ? { valores } : {}) });
      if (opciones.fallaSi?.(texto)) return Promise.reject(new Error(`falló: ${texto}`));
      // Un mensaje con varias sentencias devuelve un resultado por sentencia, como pg.
      const partes = texto.split(/;\s*(?=\S)/);
      const r = partes.map((p) => ({ command: p.trim().split(/\s+/)[0].toUpperCase(), rowCount: 1, rows: [[p]], fields: [] }));
      return Promise.resolve(r.length > 1 ? r : r[0]);
    },
    escapeLiteral: (s: string) => `'${s.replace(/'/g, "''")}'`,
  };
  return { c, salidas };
}

// Lo que hace Prisma (adapter-pg) al abrir una transacción y usarla: siempre objeto + valores.
const q = (c: ConexionPg, text: string, values: unknown[] = []) => c.query({ text, values, rowMode: "array" }, values);

test("BEGIN + negocio salen en UN mensaje; la consulta y el COMMIT, como siempre", async () => {
  const { c, salidas } = conexionFalsa();
  instalarBeginConNegocio(c);
  await q(c, "BEGIN");
  const guc = await q(c, GUC, [ID]);
  await q(c, 'SELECT count(*) FROM "Order"');
  await q(c, "COMMIT");
  assert.deepEqual(
    salidas.map((s) => s.texto),
    [`BEGIN; SELECT set_config('app.current_tenant_id', '${ID}', true)`, 'SELECT count(*) FROM "Order"', "COMMIT"],
  );
  // Lo que ve Prisma del set_config es el resultado del set_config (el último del mensaje).
  assert.equal((guc as { command: string }).command, "SELECT");
  assert.equal((guc as { rowCount: number }).rowCount, 1);
  // El mensaje junto sale sin parámetros (protocolo simple), y conserva el formato de filas.
  assert.equal(salidas[0].valores, undefined);
});

test("con nivel de aislamiento: BEGIN ISOLATION LEVEL X; set_config — dos viajes menos", async () => {
  const { c, salidas } = conexionFalsa();
  instalarBeginConNegocio(c);
  await q(c, "BEGIN");
  await q(c, "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  await q(c, GUC, [ID]);
  await q(c, "COMMIT");
  assert.deepEqual(salidas.map((s) => s.texto), [
    `BEGIN ISOLATION LEVEL SERIALIZABLE; SELECT set_config('app.current_tenant_id', '${ID}', true)`,
    "COMMIT",
  ]);
  for (const nivel of ["READ UNCOMMITTED", "READ COMMITTED", "REPEATABLE READ"]) {
    const { c: c2, salidas: s2 } = conexionFalsa();
    instalarBeginConNegocio(c2);
    await q(c2, "BEGIN");
    await q(c2, `SET TRANSACTION ISOLATION LEVEL ${nivel}`);
    await q(c2, "SELECT 1");
    assert.deepEqual(s2.map((s) => s.texto), [`BEGIN ISOLATION LEVEL ${nivel}`, "SELECT 1"]);
  }
});

test("si lo primero no es el negocio, sale el BEGIN solo y después lo pedido (lo de siempre)", async () => {
  const { c, salidas } = conexionFalsa();
  instalarBeginConNegocio(c);
  await q(c, "BEGIN");
  await q(c, 'SELECT * FROM "Tenant" WHERE id = $1', [ID]);
  await q(c, GUC, [ID]); // un set_config que NO es lo primero va parametrizado, como siempre
  await q(c, "COMMIT");
  assert.deepEqual(salidas, [
    { texto: "BEGIN" },
    { texto: 'SELECT * FROM "Tenant" WHERE id = $1', valores: [ID] },
    { texto: GUC, valores: [ID] },
    { texto: "COMMIT", valores: [] },
  ]);
});

test("una transacción vacía no sale a la red (BEGIN + COMMIT/ROLLBACK)", async () => {
  for (const fin of ["COMMIT", "ROLLBACK"]) {
    const { c, salidas } = conexionFalsa();
    instalarBeginConNegocio(c);
    await q(c, "BEGIN");
    await q(c, "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const r = await q(c, fin);
    assert.equal((r as { command: string }).command, fin);
    assert.equal(salidas.length, 0);
    // Y la conexión queda libre: lo siguiente sale derecho.
    await q(c, "SELECT 1");
    assert.deepEqual(salidas.map((s) => s.texto), ["SELECT 1"]);
  }
});

test("el id sólo viaja como literal si tiene forma de id; si no, sale parametrizado", async () => {
  for (const raro of ["a'b", "x; DROP TABLE \"Order\"", "", "con espacio", 42]) {
    const { c, salidas } = conexionFalsa();
    instalarBeginConNegocio(c);
    await q(c, "BEGIN");
    await q(c, GUC, [raro]);
    assert.deepEqual(salidas, [{ texto: "BEGIN" }, { texto: GUC, valores: [raro] }], `id ${JSON.stringify(raro)}`);
  }
});

test("un set_config con nombre de sentencia preparada, otro GUC o dos valores no se toca", async () => {
  const casos: [unknown, unknown[]][] = [
    [{ name: "s1", text: GUC, values: [ID] }, [ID]],
    [{ text: "SELECT set_config('otra.cosa', $1, true)", values: [ID] }, [ID]],
    [{ text: "SELECT set_config('app.current_tenant_id', $1, false)", values: [ID] }, [ID]],
    [{ text: GUC, values: [ID, "x"] }, [ID, "x"]],
  ];
  for (const [config, valores] of casos) {
    const { c, salidas } = conexionFalsa();
    instalarBeginConNegocio(c);
    await q(c, "BEGIN");
    await c.query(config, valores);
    assert.equal(salidas.length, 2, JSON.stringify(config));
    assert.equal(salidas[0].texto, "BEGIN");
  }
});

test("el orden de llegada se respeta aunque el BEGIN haya salido solo (Promise.all dentro de la transacción)", async () => {
  const { c, salidas } = conexionFalsa();
  instalarBeginConNegocio(c);
  await q(c, "BEGIN");
  await Promise.all([q(c, "SELECT 'a'"), q(c, "SELECT 'b'"), q(c, "SELECT 'c'")]);
  await q(c, "COMMIT");
  assert.deepEqual(salidas.map((s) => s.texto), ["BEGIN", "SELECT 'a'", "SELECT 'b'", "SELECT 'c'", "COMMIT"]);
});

test("el orden de llegada se respeta cuando el BEGIN salió junto con el negocio", async () => {
  const { c, salidas } = conexionFalsa();
  instalarBeginConNegocio(c);
  await q(c, "BEGIN");
  await Promise.all([q(c, GUC, [ID]), q(c, "SELECT 'a'"), q(c, "SELECT 'b'")]);
  assert.deepEqual(salidas.map((s) => s.texto), [
    `BEGIN; SELECT set_config('app.current_tenant_id', '${ID}', true)`,
    "SELECT 'a'",
    "SELECT 'b'",
  ]);
});

test("si el BEGIN que salió solo falla, nada corre fuera de la transacción", async () => {
  const { c, salidas } = conexionFalsa({ fallaSi: (t) => t === "BEGIN" });
  instalarBeginConNegocio(c);
  await q(c, "BEGIN"); // Prisma ve el BEGIN bien: todavía no salió
  const [a, b] = await Promise.allSettled([q(c, "UPDATE x SET y = 1"), q(c, "SELECT 2")]);
  assert.equal(a.status, "rejected");
  assert.equal(b.status, "rejected");
  assert.match(String((a as PromiseRejectedResult).reason), /falló: BEGIN/);
  // Ni el UPDATE ni el SELECT salieron: sólo el BEGIN que falló.
  assert.deepEqual(salidas.map((s) => s.texto), ["BEGIN"]);
  // Un COMMIT tampoco pasa; el ROLLBACK de Prisma se contesta sin salir y libera la conexión.
  await assert.rejects(q(c, "COMMIT"), /falló: BEGIN/);
  await q(c, "ROLLBACK");
  await q(c, "SELECT 3");
  assert.deepEqual(salidas.map((s) => s.texto), ["BEGIN", "SELECT 3"]);
});

test("si el mensaje junto falla, el error llega a quien pidió el set_config", async () => {
  const { c } = conexionFalsa({ fallaSi: (t) => t.startsWith("BEGIN;") });
  instalarBeginConNegocio(c);
  await q(c, "BEGIN");
  await assert.rejects(q(c, GUC, [ID]), /falló: BEGIN;/);
});

test("una conexión que vuelve al pool con un BEGIN pendiente lo pierde", async () => {
  const oyentes: Record<string, (...a: unknown[]) => void> = {};
  const pool = { on: (ev: string, fn: (...a: unknown[]) => void) => void (oyentes[ev] = fn) };
  instalarEnPool(pool);
  const { c, salidas } = conexionFalsa();
  oyentes.connect(c);
  await q(c, "BEGIN");
  oyentes.release(undefined, c);
  await q(c, "SELECT 1");
  assert.deepEqual(salidas.map((s) => s.texto), ["SELECT 1"]);
});

test("se instala una sola vez por conexión", async () => {
  const { c, salidas } = conexionFalsa();
  const a = instalarBeginConNegocio(c);
  const b = instalarBeginConNegocio(c);
  assert.equal(a, b);
  await q(c, "BEGIN");
  await q(c, GUC, [ID]);
  assert.equal(salidas.length, 1);
});

test("lo que no es una transacción pasa derecho, con sus valores", async () => {
  const { c, salidas } = conexionFalsa();
  instalarBeginConNegocio(c);
  await q(c, 'SELECT "id" FROM "Tenant" WHERE "subdomain" = $1', ["magra"]);
  await c.query("SELECT 1");
  assert.deepEqual(salidas, [
    { texto: 'SELECT "id" FROM "Tenant" WHERE "subdomain" = $1', valores: ["magra"] },
    { texto: "SELECT 1" },
  ]);
});
