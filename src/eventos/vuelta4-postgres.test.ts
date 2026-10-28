// ============================================================================
// P2 · vuelta 4 de la certificación, contra una base efímera (PGlite o el Postgres del arnés)
// ============================================================================
//   node scripts/qa/p2-pglite.mjs src/eventos/vuelta4-postgres.test.ts
//   node --import tsx --test src/eventos/vuelta4-postgres.test.ts          # Postgres local (5433)
//
// 1. pedido.cobrado@1 por los dos caminos que faltaban (CERT-P2, vuelta 1, observación):
//    · cobro parcial que salda el pedido (settlement/collection-repo.ts, applyCollectionInTx);
//    · el fiado (clientes/fiado.ts): entregar al fiado NO emite (no entró plata); el cobro que
//      salda la deuda del pedido, sí. Una sola fila aunque el pedido se cobre por otro camino;
//      si el cobro vuelve atrás, no queda el evento.
// 2. v2-d (costo): con N2_hub, la dedupe va por índice (UNIQUE + parcial), no recorre el outbox.
//    Acá: el plan (BitmapOr de los dos índices, sin Seq Scan) y la consulta vieja contra la nueva
//    con 15 000 + 5 000 filas (PGlite se traba armando índices sobre tablas más grandes). La
//    medida con 200 000 filas está en scripts/qa/p2-costo-dedupe-pglite.mjs. Los milisegundos de
//    PGlite (WASM) sirven para comparar, no son los de Neon.
// 3. La fila que escribe un proceso con el probe viejo después de N2_hub (clave NULL) se ve en la
//    dedupe y el PASO POSTERIOR de N2_hub la completa sin chocar con el UNIQUE.
// 4. Un emoji partido por el recorte ya no tumba la transacción (jsonb rechaza el sustituto suelto).
// ============================================================================

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";

const PGLITE = process.env.ERP_TEST_MOTOR === "pglite";
const FILAS = Number(process.env.P2_FILAS ?? 15_000); // PGlite se traba armando índices por encima de ~40k filas de este ancho (no es Postgres): la medida de 200k va aparte
const t0Total = Date.now();
const paso = (q: string) => console.error(`[vuelta4 +${((Date.now() - t0Total) / 1000).toFixed(1)} s] ${q}`);

type Fila = { id: string; type: string; payload: { clave: string; datos: Record<string, unknown> } };

test("P2 vuelta 4 · pedido.cobrado por cobranza y fiado; dedupe indexada con N2_hub (v2-d)", { timeout: 900_000 }, async (t: TestContext) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  Object.assign(env, { NODE_ENV: "development", DB_CONNECTION_LIMIT: "4", DB_CONNECT_TIMEOUT_MS: "3000" });
  env.FORCE_TENANT_SLUG = base.a.slug;

  const duenio = await prismaComoDuenio(base);
  const { tenantTransaction } = await import("@/lib/rls");
  const { recordCollection, applyCollectionInTx } = await import("@/lib/settlement/collection-repo");
  const { registrarFiadoDelPedidoEnTx } = await import("@/lib/clientes/fiado");
  const { cobrarFiadoInTx } = await import("@/lib/debts/receivable-service");
  const { cobrarPedidoEnTx } = await import("@/lib/order-core");
  const { emitirPedidoCobradoAlSaldar } = await import("@/eventos/del-core");
  const { emitirEvento, olvidarColumnasDelOutbox, SQL_YA_ESTA, SQL_YA_ESTA_CON_COLUMNAS } = await import("@/eventos/emitir");

  const A = base.a.id;
  const cliente = base.a.clientes[0];
  let codigo = 900;
  const pedido = async (total: number, extra: { status?: "PENDING" | "DELIVERED"; clientId?: string } = {}) =>
    (
      await duenio.order.create({
        data: { tenantId: A, code: codigo++, customerName: "QA", customerPhone: "", total, status: extra.status ?? "PENDING", clientId: extra.clientId ?? null },
        select: { id: true },
      })
    ).id;
  const cobrados = (pedidoId: string) =>
    duenio.$queryRawUnsafe<Fila[]>(
      `SELECT "id", "type", "payload" FROM "OutboxEvent" WHERE "tenantId" = $1 AND "type" = 'pedido.cobrado@1' AND "payload"->>'clave' = $2`,
      A,
      `pedido:${pedidoId}:cobrado`,
    );
  const cobro = (pedidoId: string, total: number, amount: number, method: "EFECTIVO" | "TRANSFERENCIA" | "MERCADOPAGO") =>
    recordCollection(A, { originType: "ORDER", originId: pedidoId, orderId: pedidoId, totalCharged: total, amount, method, collectedBy: "user:qa" });

  async function caminos(fase: string) {
    paso(`caminos ${fase}`);
    // a) Cobro parcial que salda: el primero no emite, el que cierra el saldo sí (una vez).
    const p1 = await pedido(10_000);
    await cobro(p1, 10_000, 4_000, "EFECTIVO");
    assert.equal((await cobrados(p1)).length, 0, `${fase}: un cobro parcial emitió`);
    await cobro(p1, 10_000, 6_000, "TRANSFERENCIA");
    const [e1, ...resto1] = await cobrados(p1);
    assert.ok(e1 && resto1.length === 0, `${fase}: el saldo emitió ${resto1.length + (e1 ? 1 : 0)} filas`);
    assert.equal(e1.payload.datos.monto, 10_000);
    assert.equal(e1.payload.datos.medio, "TRANSFERENCIA");
    assert.equal(typeof e1.payload.datos.codigo, "number");
    assert.equal((await duenio.order.findUnique({ where: { id: p1 }, select: { paid: true } }))?.paid, true);

    // b) Ya cobrado por el botón «Cobrar»: un cobro de la cobranza después no lo vuelve a emitir.
    const p2 = await pedido(5_000);
    assert.equal((await tenantTransaction((tx) => cobrarPedidoEnTx(tx, A, { orderId: p2, method: "EFECTIVO", actor: "user:qa" }), { tenantId: A })).tipo, "cobrado");
    await cobro(p2, 5_000, 5_000, "EFECTIVO");
    assert.equal((await cobrados(p2)).length, 1, `${fase}: botón + cobranza duplicó`);

    // c) Al revés: saldado por la cobranza, el botón dice «ya cobrado» y no emite.
    const p3 = await pedido(3_000);
    await cobro(p3, 3_000, 3_000, "MERCADOPAGO");
    assert.equal((await tenantTransaction((tx) => cobrarPedidoEnTx(tx, A, { orderId: p3, method: "EFECTIVO", actor: "user:qa" }), { tenantId: A })).tipo, "ya-cobrado");
    const e3 = await cobrados(p3);
    assert.equal(e3.length, 1);
    assert.equal(e3[0].payload.datos.medio, "MP");

    // d) Reemitir el mismo hecho por otro camino: la clave lo ataja.
    const otra = await tenantTransaction((tx) => emitirPedidoCobradoAlSaldar(tx, { tenantId: A, pedidoId: p3, medio: "EFECTIVO" }), { tenantId: A });
    assert.equal(otra && "motivo" in otra ? otra.motivo : null, "duplicado");

    // e) El cobro que salda vuelve atrás → no hay cobro, ni pedido pago, ni evento (P2-C3).
    const p4 = await pedido(2_000);
    await assert.rejects(
      tenantTransaction(async (tx) => {
        await applyCollectionInTx(tx, A, { originType: "ORDER", originId: p4, orderId: p4, totalCharged: 2_000, amount: 2_000, method: "EFECTIVO", collectedBy: "user:qa" });
        throw new Error("falló después del cobro");
      }, { tenantId: A }),
      /falló después del cobro/,
    );
    assert.equal((await cobrados(p4)).length, 0, `${fase}: el rollback dejó el evento`);
    assert.equal((await duenio.order.findUnique({ where: { id: p4 }, select: { paid: true } }))?.paid, false);

    // f) Fiado: seña por la cobranza, entrega al fiado (no emite: no entró plata), cobro parcial de
    //    la deuda (no emite) y el que la salda (emite, con el total del pedido y el medio de ESE cobro).
    const p5 = await pedido(8_000, { status: "DELIVERED", clientId: cliente });
    await cobro(p5, 8_000, 2_000, "EFECTIVO");
    const fiado = await tenantTransaction((tx) => registrarFiadoDelPedidoEnTx(tx, A, { orderId: p5, actor: "user:qa" }), { tenantId: A });
    assert.equal(fiado.tipo, "creado");
    const deudaId = fiado.tipo === "creado" ? fiado.receivableId : "";
    assert.equal((await cobrados(p5)).length, 0, `${fase}: entregar al fiado emitió pedido.cobrado`);
    const pagarDeuda = (amount: number, method: "EFECTIVO" | "MERCADOPAGO") =>
      tenantTransaction((tx) => cobrarFiadoInTx(tx, A, deudaId, { amount, method, by: "user:qa" }, new Date(), false), { tenantId: A });
    await pagarDeuda(1_000, "EFECTIVO");
    assert.equal((await cobrados(p5)).length, 0, `${fase}: un pago parcial del fiado emitió`);
    await pagarDeuda(5_000, "MERCADOPAGO");
    const e5 = await cobrados(p5);
    assert.equal(e5.length, 1, `${fase}: saldar el fiado emitió ${e5.length}`);
    assert.equal(e5[0].payload.datos.monto, 8_000);
    assert.equal(e5[0].payload.datos.medio, "MP");

    // Una deuda cargada a mano (sin pedido) no emite pedido.cobrado.
    const aMano = await duenio.accountReceivable.create({ data: { tenantId: A, clientId: cliente, amount: 1_500, concept: "a mano", createdBy: "user:qa" }, select: { id: true } });
    const antes = await duenio.outboxEvent.count({ where: { tenantId: A, type: "pedido.cobrado@1" } });
    await tenantTransaction((tx) => cobrarFiadoInTx(tx, A, aMano.id, { amount: 1_500, method: "EFECTIVO", by: "user:qa" }, new Date(), false), { tenantId: A });
    assert.equal(await duenio.outboxEvent.count({ where: { tenantId: A, type: "pedido.cobrado@1" } }), antes);
  }

  /** Mediana en ms de `n` corridas de la consulta de dedupe con una clave que NO está (el caso de cada venta). */
  async function medir(sql: string, n = 15): Promise<number> {
    const ms: number[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      await duenio.$queryRawUnsafe(sql, A, "pedido.cobrado@1", `pedido:no-esta-${i}:cobrado`);
      ms.push(performance.now() - t0);
    }
    ms.sort((x, y) => x - y);
    return ms[Math.floor(n / 2)];
  }
  const plan = async (sql: string) =>
    JSON.stringify(await duenio.$queryRawUnsafe(`EXPLAIN (FORMAT JSON) ${sql}`, A, "pedido.cobrado@1", "pedido:no-esta:cobrado"));

  // ── Fase 1: como Neon hoy (sin N2_hub) ──
  olvidarColumnasDelOutbox();
  await caminos("sin-n2");

  paso("relleno");
  // Relleno del outbox del negocio A: FILAS eventos emitidos sin N2_hub (con payload._clave) y
  // 5 000 InvoiceCreated (sin clave).
  await duenio.$executeRawUnsafe(
    `INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload")
     SELECT 'relleno_' || g, $1, 'pedido.cobrado@1',
            jsonb_build_object('clave', 'relleno:' || g || ':cobrado', '_clave', 'relleno:' || g || ':cobrado', 'datos', jsonb_build_object('monto', g))
     FROM generate_series(1, ${FILAS}) AS g`,
    A,
  );
  await duenio.$executeRawUnsafe(
    `INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload")
     SELECT 'arca_' || g, $1, 'InvoiceCreated', jsonb_build_object('invoiceId', 'inv_' || g) FROM generate_series(1, 5000) AS g`,
    A,
  );
  await duenio.$executeRawUnsafe(`ANALYZE "OutboxEvent"`);
  const sinN2 = await medir(SQL_YA_ESTA);
  t.diagnostic(`v2-d · SIN N2_hub (Neon hoy), ${FILAS} filas del mismo tipo en el negocio: chequeo previo = ${sinN2.toFixed(1)} ms (mediana) · plan: ${(await plan(SQL_YA_ESTA)).match(/"Node Type":"[^"]+"/g)?.join(" > ")}`);

  paso("N2_hub");
  // ── Fase 2: con N2_hub (sólo en esta base efímera) ──
  await aplicarN2Hub(base);
  olvidarColumnasDelOutbox();
  await duenio.$executeRawUnsafe(`ANALYZE "OutboxEvent"`);
  const backfill = await duenio.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "OutboxEvent" WHERE "clave" LIKE 'relleno:%'`);
  assert.equal(Number(backfill[0].n), FILAS, "N2_hub no completó la clave de lo emitido antes");

  paso("medir");
  const vieja = await medir(SQL_YA_ESTA);
  const nueva = await medir(SQL_YA_ESTA_CON_COLUMNAS);
  const planNueva = await plan(SQL_YA_ESTA_CON_COLUMNAS);
  const planVieja = await plan(SQL_YA_ESTA);
  t.diagnostic(`v2-d · CON N2_hub: consulta de la vuelta 3 = ${vieja.toFixed(1)} ms · nueva = ${nueva.toFixed(2)} ms (medianas)`);
  t.diagnostic(`v2-d · plan nuevo: ${planNueva.match(/"(Node Type|Index Name)":"[^"]+"/g)?.join(" > ")}`);
  t.diagnostic(`v2-d · plan viejo: ${planVieja.match(/"(Node Type|Index Name)":"[^"]+"/g)?.join(" > ")}`);
  assert.ok(!/"Seq Scan"/.test(planNueva), `la dedupe nueva recorre la tabla: ${planNueva}`);
  assert.ok(planNueva.includes("OutboxEvent_tenantId_clave_key"), "la rama de la columna no usa el UNIQUE");
  assert.ok(planNueva.includes("OutboxEvent_tenantId_payloadClave_sinClave_idx"), "la rama de clave NULL no usa el índice parcial");
  assert.ok(nueva * 5 < vieja, `la nueva (${nueva.toFixed(2)} ms) no es mucho más barata que la vieja (${vieja.toFixed(1)} ms)`);

  // La emisión entera dentro de la transacción del hecho (candado + chequeo + insert), con FILAS + 5 000 filas.
  const emisiones: number[] = [];
  for (let i = 0; i < 9; i++) {
    const t0 = performance.now();
    const r = await tenantTransaction(
      (tx) => emitirEvento(tx, { tenantId: A, tipo: "pedido.cobrado", version: 1, clave: `medida:${i}:cobrado`, datos: { pedidoId: `m${i}`, codigo: i, monto: 1, medio: "EFECTIVO", cobradoEn: "2026-10-28T10:00:00.000Z" } }),
      { tenantId: A },
    );
    emisiones.push(performance.now() - t0);
    assert.equal("modo" in r ? r.modo : null, "columnas");
  }
  emisiones.sort((x, y) => x - y);
  t.diagnostic(`v2-d · emisión completa con N2_hub y ${FILAS + 5_000} filas: ${emisiones[4].toFixed(1)} ms (mediana de 9, transacción incluida)`);

  // Lo emitido ANTES de N2_hub sigue sin duplicarse (backfill), y por la columna.
  const reemitido = await tenantTransaction(
    (tx) => emitirEvento(tx, { tenantId: A, tipo: "pedido.cobrado", version: 1, clave: "relleno:77:cobrado", datos: { pedidoId: "x", codigo: 1, monto: 1, medio: "EFECTIVO", cobradoEn: "2026-10-28T10:00:00.000Z" } }),
    { tenantId: A },
  );
  assert.deepEqual(reemitido, { escrito: false, motivo: "duplicado", modo: "columnas" });

  // Un proceso con el probe viejo (60 s) escribe DESPUÉS de N2_hub con clave NULL: la dedupe la ve
  // por el índice parcial, y el PASO POSTERIOR de N2_hub la completa sin chocar con el UNIQUE.
  const tardia = { clave: "tardio:1:cobrado", _clave: "tardio:1:cobrado", datos: {} };
  await duenio.$executeRawUnsafe(`INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload") VALUES ('tardio_1', $1, 'pedido.cobrado@1', $2::jsonb)`, A, JSON.stringify(tardia));
  // Y un duplicado del mismo hecho de antes (clave NULL) de una fila que YA tiene la columna.
  await duenio.$executeRawUnsafe(
    `INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload") VALUES ('tardio_dup', $1, 'pedido.cobrado@1', $2::jsonb)`,
    A,
    JSON.stringify({ clave: "relleno:5:cobrado", _clave: "relleno:5:cobrado", datos: {} }),
  );
  const contraLaTardia = await tenantTransaction(
    (tx) => emitirEvento(tx, { tenantId: A, tipo: "pedido.cobrado", version: 1, clave: "tardio:1:cobrado", datos: { pedidoId: "x", codigo: 1, monto: 1, medio: "EFECTIVO", cobradoEn: "2026-10-28T10:00:00.000Z" } }),
    { tenantId: A },
  );
  assert.deepEqual(contraLaTardia, { escrito: false, motivo: "duplicado", modo: "columnas" }, "la fila de clave NULL no se vio");
  const pasoPosterior = posteriorDeN2Hub();
  const r1 = await duenio.$executeRawUnsafe(pasoPosterior);
  const r2 = await duenio.$executeRawUnsafe(pasoPosterior);
  assert.equal(r1, 1, "el paso posterior tenía que completar la fila tardía (y sólo esa)");
  assert.equal(r2, 0, "el paso posterior no es idempotente");
  const filas = await duenio.$queryRawUnsafe<{ id: string; clave: string | null }[]>(`SELECT "id", "clave" FROM "OutboxEvent" WHERE "id" IN ('tardio_1', 'tardio_dup') ORDER BY "id"`);
  assert.deepEqual(filas, [{ id: "tardio_1", clave: "tardio:1:cobrado" }, { id: "tardio_dup", clave: null }]);

  // Los caminos de pedido.cobrado, ahora en modo columnas.
  await caminos("con-n2");

  paso("emoji");
  // ── 4. Emoji en el borde del recorte ──
  await assert.rejects(duenio.$queryRawUnsafe(`SELECT $1::jsonb AS j`, JSON.stringify({ m: "a\ud83d" })), "jsonb acepta un sustituto suelto: el arreglo no haría falta");
  const conEmoji = await tenantTransaction(
    (tx) => emitirEvento(tx, { tenantId: A, tipo: "pedido.cancelado", version: 1, clave: "emoji:1:cancelado", datos: { pedidoId: "x", codigo: 1, motivo: `${"a".repeat(499)}😀 se arrepintió` } }),
    { tenantId: A },
  );
  assert.equal(conEmoji.escrito, true, "un motivo con un emoji en el carácter 500 tumbó la emisión");

  if (PGLITE) t.diagnostic("PGlite: sin RLS (superusuario) y sin concurrencia real; los ms son de WASM");
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

/** El UPDATE del PASO POSTERIOR, tal cual está escrito en el pie de N2_hub.sql. */
function posteriorDeN2Hub(): string {
  const lineas = readFileSync(path.join(process.cwd(), "prisma", "pending-gate2", "N2_hub.sql"), "utf8").replace(/\r\n/g, "\n").split("\n");
  const desde = lineas.findIndex((l) => l.startsWith("-- PASO POSTERIOR"));
  const ini = lineas.findIndex((l, k) => k > desde && l.startsWith("--   UPDATE"));
  const fin = lineas.findIndex((l, k) => k >= ini && l.trimEnd().endsWith(");"));
  assert.ok(desde > 0 && ini > desde && fin >= ini, "N2_hub.sql: falta el UPDATE del PASO POSTERIOR");
  return lineas.slice(ini, fin + 1).map((l) => l.replace(/^--\s+/, "")).join("\n");
}
