// Pase M1 (30/10) — SÓLO LECTURA después de migrar. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const m = await c.query(`SELECT slug, subdomain, status::text FROM "Tenant" ORDER BY slug`);
const e = await c.query(`SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) v FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname IN ('PaymentMethod','CashMethod') GROUP BY 1`);
const q = await c.query(`SELECT
  (SELECT count(*) FROM "Order" WHERE "paymentMethod"::text IN ('DEBITO','CREDITO'))::int AS pedidos,
  (SELECT count(*) FROM "Collection" WHERE method::text IN ('DEBITO','CREDITO'))::int AS cobros,
  (SELECT count(*) FROM "CashMovement" WHERE method::text = 'TRANSFERENCIA')::int AS libro,
  (SELECT count(*) FROM "Tenant")::int AS negocios`);
await c.query("ROLLBACK");
await c.end();
console.log(m.rows); console.table(e.rows); console.log(q.rows[0]);
