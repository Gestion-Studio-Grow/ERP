// Manual de caja (31/10) — SÓLO LECTURA. No se commitea. Sin claves ni certificados.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const r = await c.query(`SELECT slug,subdomain,plan,profile,"arcaCuit" IS NOT NULL AS tiene_cuit,"arcaHomologacion" homolog,"arcaPuntoVenta" pv,"createdAt"::date alta,timezone FROM "Tenant" WHERE slug IN ('supermercado','gsg','comerciante','magra') ORDER BY slug`);
console.log(r.rows);
const f = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ~* '(invoice|factura|mpconnection|conexion|mercado|comprobante)' ORDER BY 1`);
console.log(f.rows.map(x=>x.table_name).join(","));
const u = await c.query(`SELECT t.slug,u.email,u.active,u."deletedAt" IS NOT NULL baja,u."createdAt"::date alta FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId" WHERE t.slug='supermercado'`);
console.log(u.rows);
await c.query("ROLLBACK"); await c.end();
