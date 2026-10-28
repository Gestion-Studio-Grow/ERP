// ============================================================================
// P2 · vuelta 6 de la certificación (F7): los eventos de las operaciones masivas, EN LOTE, contra
// una base efímera (PGlite o el Postgres del arnés). Nunca Neon.
// ============================================================================
//   node scripts/qa/p2-pglite.mjs src/eventos/vuelta6-postgres.test.ts
//   node --import tsx --test src/eventos/vuelta6-postgres.test.ts          # Postgres local (5433)
//
// En los dos estados de la base (sin y con N2_hub):
//   · «Actualizar precios» de MAX_FILAS = 2000 productos (registrarCambiosDePrecio en una
//     transacción Serializable con el tope POR DEFECTO de Prisma, 5 s) entra con margen y deja
//     2000 `producto.actualizado@1`. Antes (uno por uno) se pasaba del tope y no se guardaba nada.
//   · un recuento de 300 líneas (ajustarEnTx) deja un `stock.ajustado@1` por línea y el `stock.bajo@1`
//     de las que cruzan el mínimo;
//   · el lote cumple el contrato de `emitirEvento`: un candado por clave, dedupe contra lo ya
//     escrito (también la fila suelta y la de `clave` NULL), una clave repetida en el lote sale
//     una vez, un evento inválido tira sin escribir nada y el rollback no deja filas.
// PGlite corre como superusuario y atiende de a una consulta: no prueba RLS ni carreras, y sus
// milisegundos son de WASM (sirven para comparar, no como número de producción).
// ============================================================================

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const PGLITE = process.env.ERP_TEST_MOTOR === "pglite";
/** Tope del aumento masivo: el dictamen pide ≤ 1,5 s en PGlite (el de Prisma es 5 s). */
const TOPE_MASIVO_MS = Number(process.env.P2_TOPE_MASIVO_MS ?? 1_500);

class Deshacer extends Error {}

test("P2 vuelta 6 · F7: producto.actualizado y stock.ajustado en lote (2000 productos, recuento de 300)", { timeout: 900_000 }, async (t: TestContext) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  env.FORCE_TENANT_SLUG = base.a.slug;

  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { registrarCambiosDePrecio } = await import("@/lib/catalogo/precios-auditoria");
  const { MAX_FILAS } = await import("@/lib/catalogo/planilla-core");
  const { ajustarEnTx } = await import("@/lib/stock/adjustment-insert");
  const { emitirEvento, emitirEventosEnLote, olvidarColumnasDelOutbox, EventoInvalido } = await import("@/eventos/emitir");

  const A = base.a.id;
  const B = base.b.id;
  assert.equal(MAX_FILAS, 2000);
  const tx = <T>(fn: (tx: never) => Promise<T>, tenantId = A) => tenantTransaction((x) => fn(x as never), { tenantId });
  const cuantos = async (tipo: string, extra = "", ...valores: unknown[]) =>
    (await duenio.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND "type" = $2 ${extra}`,
      A, `${tipo}@1`, ...valores,
    ))[0].n;

  // 2000 productos de A, para las dos fases.
  await duenio.product.createMany({ data: Array.from({ length: MAX_FILAS }, (_, i) => ({ tenantId: A, name: `Masivo ${i}`, price: 1000 + i })) });
  const ids = (await duenio.product.findMany({ where: { tenantId: A, name: { startsWith: "Masivo " } }, select: { id: true }, orderBy: { id: "asc" } })).map((p) => p.id);
  assert.equal(ids.length, MAX_FILAS);

  async function fase(nombre: string) {
    // ── F7 · «Actualizar precios» de 2000 productos, Serializable y con el tope por defecto (5 s)
    const lote = `lote-${nombre}`;
    const cambios = ids.map((productId) => ({ productId, nombre: "x", saleUnit: "UNIT" as const, antes: 1000, despues: 1100 }));
    await duenio.product.updateMany({ where: { id: { in: ids } }, data: { price: 1100 } });
    const aumento = () =>
      tenantTransaction(
        (x) => registrarCambiosDePrecio(x as never, { tenantId: A, actor: "user:qa", origen: "actualizar-precios", cambios, lote: { id: lote, sentido: "subir", porcentaje: 10 } } as never),
        { tenantId: A, isolationLevel: "Serializable" },
      );
    const t0 = performance.now();
    await aumento();
    const ms = performance.now() - t0;
    const conLote = `AND "payload"->>'clave' LIKE $3`;
    const delLote = `%:precio:${lote}`;
    assert.equal(await cuantos("producto.actualizado", conLote, delLote), MAX_FILAS, `${nombre}: faltan eventos del aumento`);
    t.diagnostic(`${nombre}: aumento de ${MAX_FILAS} productos en ${ms.toFixed(0)} ms (tope ${TOPE_MASIVO_MS} ms)`);
    assert.ok(ms <= TOPE_MASIVO_MS, `${nombre}: el aumento de ${MAX_FILAS} productos tardó ${ms.toFixed(0)} ms`);
    // Forma del sobre: la del catálogo, igual que uno por uno.
    const [uno] = await duenio.$queryRawUnsafe<{ payload: { clave: string; datos: Record<string, unknown>; negocio: string } }[]>(
      `SELECT "payload" FROM "OutboxEvent" WHERE "tenantId" = $1 AND "payload"->'datos'->>'productoId' = $2 AND "payload"->>'clave' LIKE $3`,
      A, ids[7], delLote,
    );
    assert.deepEqual(uno.payload.datos, { productoId: ids[7], sku: null, precio: 1100, activo: true, cambios: ["precio"] });
    assert.equal(uno.payload.clave, `producto:${ids[7]}:precio:${lote}`);
    assert.equal(uno.payload.negocio, A);
    // Reemitir el mismo lote (doble clic, reintento por 40001) no duplica ninguno.
    const t1 = performance.now();
    await aumento();
    t.diagnostic(`${nombre}: el mismo lote otra vez (todo duplicado) en ${(performance.now() - t1).toFixed(0)} ms`);
    assert.equal(await cuantos("producto.actualizado", conLote, delLote), MAX_FILAS, `${nombre}: el mismo lote duplicó`);
    // Rollback: un aumento que vuelve atrás no deja eventos.
    const loteX = `lote-${nombre}-deshecho`;
    await assert.rejects(
      tx(async (x) => {
        await registrarCambiosDePrecio(x as never, { tenantId: A, actor: "user:qa", origen: "actualizar-precios", cambios: cambios.slice(0, 50), lote: { id: loteX, sentido: "subir", porcentaje: 1 } } as never);
        throw new Deshacer();
      }),
      Deshacer,
    );
    assert.equal(await cuantos("producto.actualizado", conLote, `%:precio:${loteX}`), 0, `${nombre}: el rollback dejó eventos`);

    // ── El contrato del lote, directo
    const ev = (clave: string, productoId = ids[0], tenantId = A) =>
      ({ tenantId, tipo: "producto.actualizado" as const, version: 1 as const, clave, datos: { productoId, sku: null, precio: 1, activo: true, cambios: ["precio"] } });
    // Una suelta primero; en el lote, ésa sale duplicada, la repetida sale una vez.
    assert.equal((await tx((x) => emitirEvento(x, ev(`suelta-${nombre}`)))).escrito, true);
    const r = await tx((x) => emitirEventosEnLote(x, [ev(`suelta-${nombre}`), ev(`nueva-${nombre}`), ev(`nueva-${nombre}`), ev(`otra-${nombre}`)]));
    assert.deepEqual(r.map((e) => e.escrito), [false, true, false, true], `${nombre}: ${JSON.stringify(r)}`);
    for (const k of ["suelta", "nueva", "otra"]) assert.equal(await cuantos("producto.actualizado", `AND "payload"->>'clave' = $3`, `${k}-${nombre}`), 1, `${nombre}: ${k}`);
    // Y al revés: la suelta después del lote, duplicada.
    assert.deepEqual(await tx((x) => emitirEvento(x, ev(`otra-${nombre}`))), { escrito: false, motivo: "duplicado", modo: nombre === "sin-n2" ? "payload" : "columnas" });
    // Un evento inválido en el medio: tira y no escribe NINGUNO.
    const malo = { ...ev(`mala-${nombre}`), datos: { productoId: ids[0], sku: null, precio: 1, activo: "si", cambios: [] } } as never;
    await assert.rejects(tx((x) => emitirEventosEnLote(x, [ev(`antes-${nombre}`), malo])), EventoInvalido);
    assert.equal(await cuantos("producto.actualizado", `AND "payload"->>'clave' IN ($3, $4)`, `antes-${nombre}`, `mala-${nombre}`), 0);
    // Un candado por clave distinta (el mismo de `emitirEvento`), todos dentro de la transacción.
    const candados = await tx(async (x) => {
      const advisory = async () => (await (x as unknown as typeof duenio).$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()`,
      ))[0].n;
      const antes = await advisory(); // los que ya tomó la transacción (p. ej. el de tenantTransaction)
      await emitirEventosEnLote(x, [ev(`c1-${nombre}`), ev(`c2-${nombre}`), ev(`c2-${nombre}`), ev(`c3-${nombre}`)]);
      return (await advisory()) - antes;
    });
    assert.equal(candados, 3, `${nombre}: candados del lote`);
    // Otro negocio con la misma clave es otro hecho.
    const rb = await tx((x) => emitirEventosEnLote(x, [ev(`nueva-${nombre}`, "prd_b", B)]), B);
    assert.equal(rb[0].escrito, true, `${nombre}: B con la clave de A`);

    // ── F7 · recuento (ajustarEnTx): stock.ajustado de cada línea, stock.bajo de las que cruzan, en lote.
    // 300 líneas y no 500: el ledger solo (recordMovement, ~8 sentencias por línea, de antes de P2)
    // ya lleva 500 líneas a ~4,2 s en PGlite, cerca del tope de 5 s; la emisión en lote de las 499
    // suma ~75 ms. Ese costo del ledger no es de P2 (P2_RECUENTO_N para medirlo).
    const N = Number(process.env.P2_RECUENTO_N ?? 300);
    const nombreR = `Recuento ${nombre} `;
    await duenio.product.createMany({ data: Array.from({ length: N }, (_, i) => ({ tenantId: A, name: `${nombreR}${i}`, price: 100, stock: 10, lowStockAt: 5, trackStock: true })) });
    const rids = (await duenio.product.findMany({ where: { tenantId: A, name: { startsWith: nombreR } }, select: { id: true }, orderBy: { id: "asc" } })).map((p) => p.id);
    // Las primeras 10 bajan a 3 (cruzan el mínimo de 5); el resto a 9; la última coincide (sin evento).
    const items = rids.map((productId, i) => ({ productId, value: i === N - 1 ? 10 : i < 10 ? 3 : 9 }));
    const antesAj = await cuantos("stock.ajustado");
    const antesBajo = await cuantos("stock.bajo");
    const t2 = performance.now();
    const aj = await tx((x) => ajustarEnTx(x, A, { motivo: "RECUENTO", note: null, createdBy: "user:qa", items }));
    t.diagnostic(`${nombre}: recuento de ${N} líneas en ${(performance.now() - t2).toFixed(0)} ms`);
    assert.equal(aj.applied, N - 1);
    assert.equal((await cuantos("stock.ajustado")) - antesAj, N - 1, `${nombre}: stock.ajustado del recuento`);
    assert.equal((await cuantos("stock.bajo")) - antesBajo, 10, `${nombre}: stock.bajo del recuento`);
    const [bajo] = await duenio.$queryRawUnsafe<{ payload: { datos: Record<string, unknown> } }[]>(
      `SELECT "payload" FROM "OutboxEvent" WHERE "tenantId" = $1 AND "type" = 'stock.bajo@1' AND "payload"->'datos'->>'productoId' = $2`, A, rids[0],
    );
    assert.deepEqual(bajo.payload.datos, { productoId: rids[0], sku: null, nombre: `${nombreR}0`, disponible: 3, minimo: 5 });
    // Un recuento que vuelve atrás no deja eventos.
    const antesX = await cuantos("stock.ajustado");
    await assert.rejects(
      tx(async (x) => {
        await ajustarEnTx(x, A, { motivo: "RECUENTO", note: null, createdBy: "user:qa", items: rids.slice(20, 40).map((productId) => ({ productId, value: 0 })) });
        throw new Deshacer();
      }),
      Deshacer,
    );
    assert.equal(await cuantos("stock.ajustado"), antesX, `${nombre}: el recuento deshecho dejó eventos`);
  }

  olvidarColumnasDelOutbox();
  await fase("sin-n2");
  await aplicarN2Hub(base);
  olvidarColumnasDelOutbox();
  await fase("con-n2");

  // Con N2_hub, una fila con `clave` NULL (escrita por un proceso con el probe viejo) también ataja al lote.
  await duenio.$executeRawUnsafe(
    `INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload") VALUES ('evt_vieja', $1, 'producto.actualizado@1', $2::jsonb)`,
    A, JSON.stringify({ clave: "vieja-sin-columna", _clave: "vieja-sin-columna" }),
  );
  const ev = { tenantId: A, tipo: "producto.actualizado" as const, version: 1 as const, clave: "vieja-sin-columna", datos: { productoId: ids[0], sku: null, precio: 1, activo: true, cambios: ["precio"] } };
  const r = await tx((x) => emitirEventosEnLote(x, [ev]));
  assert.deepEqual(r, [{ escrito: false, motivo: "duplicado", modo: "columnas" }]);
  if (PGLITE) t.diagnostic("PGlite: sin RLS (superusuario), sin concurrencia real y con tiempos de WASM");
});

async function aplicarN2Hub(base: BaseEfimera): Promise<void> {
  const archivo = path.join(process.cwd(), "prisma", "pending-gate2", "N2_hub.sql");
  if (!PGLITE) {
    execFileSync("psql", [base.urlDuenio, "-v", "ON_ERROR_STOP=1", "-q", "-f", archivo], { stdio: ["ignore", "ignore", "pipe"] });
    return;
  }
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query(readFileSync(archivo, "utf8"));
  } finally {
    await c.end();
  }
}
