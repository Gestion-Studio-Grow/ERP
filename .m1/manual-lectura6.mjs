// SÓLO LECTURA contra Neon prod. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const r = await c.query(`SELECT t.slug,u.email,u.active,u."deletedAt" IS NOT NULL baja,u."mustChangePassword" m,u."createdAt"=(SELECT min(x."createdAt") FROM "User" x WHERE x."tenantId"=t.id AND x.role='OWNER' AND x.active AND x."deletedAt" IS NULL) es_primero FROM "User" u JOIN "Tenant" t ON t.id=u."tenantId" WHERE u.email IN ('gestionstudiogrow@gmail.com','dueno@quebienoles.com.ar') ORDER BY 1`).catch(e=>({rows:[e.message]}));
for (const x of r.rows) console.log(typeof x==='string'?x:`${x.slug} ${x.email} activo=${x.active} baja=${x.baja} debeCambiar=${x.m} primerDueno=${x.es_primero}`);
const e = await c.query(`SELECT (SELECT count(*) FROM "Order" WHERE "paymentMethod"::text IN ('DEBITO','CREDITO'))::int pedidos,(SELECT count(*) FROM "Collection" WHERE method::text IN ('DEBITO','CREDITO'))::int cobros,(SELECT count(*) FROM "CashMovement" WHERE method::text='TRANSFERENCIA')::int libro`);
console.log(e.rows[0]);
await c.query("ROLLBACK"); await c.end();
