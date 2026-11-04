// Manual de caja (31/10) — SÓLO LECTURA. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const p = await c.query(`SELECT p.name,p.price::float,p."saleUnit"::text su,p."trackStock" ts,p.stock::float,p.active FROM "Product" p JOIN "Tenant" t ON t.id=p."tenantId" WHERE t.slug='supermercado' ORDER BY p.name LIMIT 8`);
console.log(p.rows);
const q = await c.query(`SELECT count(*)::int total,count(*) FILTER (WHERE p.active)::int activos,count(*) FILTER (WHERE p."trackStock")::int controla,count(*) FILTER (WHERE p."trackStock" AND p.stock>0)::int constock,count(*) FILTER (WHERE p.price>0)::int conprecio,count(*) FILTER (WHERE p."saleUnit"::text='WEIGHT')::int peso FROM "Product" p JOIN "Tenant" t ON t.id=p."tenantId" WHERE t.slug='supermercado'`);
console.log(q.rows[0]);
const i=await c.query(`SELECT count(*)::int n FROM "IntegracionConexion" x JOIN "Tenant" t ON t.id=x."tenantId" WHERE t.slug='supermercado'`);
console.log("conexiones supermercado",i.rows[0]);
await c.query("ROLLBACK"); await c.end();
