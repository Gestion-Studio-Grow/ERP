// SÓLO LECTURA contra Neon prod. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
console.log((await c.query(`SELECT (SELECT u.id FROM "User" u WHERE u."tenantId"=t.id LIMIT 1) = 'cmuka03m5000104l2aup0mb3j' misma_persona,
 (SELECT count(*)::int FROM "CarteraCliente" k WHERE k."clienteTenantId"=t.id) en_cartera FROM "Tenant" t WHERE t.slug='supermercado'`).catch(e=>({rows:[e.message]}))).rows);
await c.query("ROLLBACK"); await c.end();
