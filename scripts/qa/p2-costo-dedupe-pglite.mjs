// ============================================================================
// P2 · v2-d (CERT-P2): costo del chequeo previo de la dedupe con 200 000 filas — sobre PGlite
// ============================================================================
//
//   node scripts/qa/p2-costo-dedupe-pglite.mjs [filas]      # 200000 por omisión
//
// PGlite (Postgres en WASM, EN MEMORIA): nunca toca una base real. El OutboxEvent con sólo las
// columnas e índices que tocan la consulta (los de las migraciones + N2_hub). Los índices se crean
// ANTES de cargar las filas: PGlite se traba armando un índice sobre una tabla de más de ~40 000
// filas (no le pasa a Postgres; en la base del arnés, `src/eventos/vuelta4-postgres.test.ts`
// aplica N2_hub sobre 20 000 filas). Los milisegundos son de WASM: sirven para comparar las
// consultas entre sí y su crecimiento con las filas, no como los de Neon.
//
// Mide (mediana de 25, con una clave que NO está — el caso de cada venta):
//   · Neon hoy (sin N2_hub): SQL_YA_ESTA, por tenantId + JSON.
//   · Con N2_hub: la consulta de la vuelta 3 (SQL_YA_ESTA también con columnas) y la nueva
//     (SQL_YA_ESTA_CON_COLUMNAS: UNIQUE + índice parcial).
// ============================================================================
import { PGlite } from "@electric-sql/pglite";

const FILAS = Number(process.argv[2] ?? 200_000);
const VIEJA = `SELECT "id" FROM "OutboxEvent" WHERE "tenantId" = $1 AND "type" = $2 AND "payload"->>'clave' = $3 LIMIT 1`;
const NUEVA = `SELECT "id" FROM "OutboxEvent" WHERE "tenantId" = $1 AND "type" = $2
  AND ("clave" = $3 OR ("clave" IS NULL AND "payload"->>'clave' = $3)) LIMIT 1`;

async function mediana(db, sql, n = 25) {
  const ms = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await db.query(sql, ["A", "pedido.cobrado@1", `pedido:no-esta-${i}:cobrado`]);
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  return ms[Math.floor(n / 2)];
}
const nodos = async (db, sql) =>
  JSON.stringify((await db.query(`EXPLAIN (FORMAT JSON) ${sql}`, ["A", "pedido.cobrado@1", "x"])).rows)
    .match(/"(Node Type|Index Name)":"[^"]+"/g)
    .join(" > ");

async function base(conN2) {
  const db = await PGlite.create();
  await db.query(`CREATE TABLE "OutboxEvent" ("id" text PRIMARY KEY, "tenantId" text NOT NULL, "type" text NOT NULL, "payload" jsonb NOT NULL,
    "processedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT now()${conN2 ? `, "version" int NOT NULL DEFAULT 1, "clave" text` : ""})`);
  await db.query(`CREATE INDEX "OutboxEvent_tenantId_idx" ON "OutboxEvent"("tenantId")`);
  await db.query(`CREATE INDEX "OutboxEvent_processedAt_idx" ON "OutboxEvent"("processedAt")`);
  if (conN2) {
    await db.query(`CREATE UNIQUE INDEX "OutboxEvent_tenantId_clave_key" ON "OutboxEvent"("tenantId", "clave")`);
    await db.query(`CREATE INDEX "OutboxEvent_tenantId_payloadClave_sinClave_idx" ON "OutboxEvent"("tenantId", ("payload"->>'clave')) WHERE "clave" IS NULL`);
  }
  // El negocio A: FILAS eventos del mismo tipo + 10% de InvoiceCreated (sin clave). Otro negocio con lo mismo.
  for (const negocio of ["A", "B"]) {
    for (let desde = 1; desde <= FILAS; desde += 50_000) {
      const hasta = Math.min(FILAS, desde + 49_999);
      await db.query(`INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload"${conN2 ? `, "clave"` : ""})
        SELECT '${negocio}_' || g, '${negocio}', 'pedido.cobrado@1',
               jsonb_build_object('clave', 'pedido:' || g || ':cobrado', 'datos', jsonb_build_object('monto', g))${conN2 ? `, 'pedido:' || g || ':cobrado'` : ""}
        FROM generate_series(${desde}, ${hasta}) AS g`);
    }
    await db.query(`INSERT INTO "OutboxEvent" ("id", "tenantId", "type", "payload")
      SELECT '${negocio}_arca_' || g, '${negocio}', 'InvoiceCreated', jsonb_build_object('invoiceId', 'inv_' || g) FROM generate_series(1, ${Math.round(FILAS / 10)}) AS g`);
  }
  await db.query(`ANALYZE "OutboxEvent"`);
  return db;
}

const sin = await base(false);
const hoy = await mediana(sin, VIEJA);
console.log(`Neon hoy (sin N2_hub) · ${FILAS} filas del tipo en el negocio: ${hoy.toFixed(2)} ms · ${await nodos(sin, VIEJA)}`);
await sin.close();

const con = await base(true);
const vieja = await mediana(con, VIEJA);
const nueva = await mediana(con, NUEVA);
console.log(`Con N2_hub · consulta de la vuelta 3: ${vieja.toFixed(2)} ms · ${await nodos(con, VIEJA)}`);
console.log(`Con N2_hub · consulta nueva:          ${nueva.toFixed(3)} ms · ${await nodos(con, NUEVA)}`);
await con.close();
