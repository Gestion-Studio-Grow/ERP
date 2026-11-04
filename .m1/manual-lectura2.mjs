// Manual de caja (31/10) — SÓLO LECTURA contra Neon prod. No se commitea. No lee hashes ni claves.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const i = await c.query(`SELECT t.slug,a."entityId",a.action,a."createdAt" FROM "AuditLog" a JOIN "Tenant" t ON t.id=a."tenantId" WHERE a.entity='Interruptor' ORDER BY t.slug,a."entityId",a."createdAt"`);
console.log("INTERRUPTORES", i.rows.map(r=>`${r.slug} ${r.entityId} ${r.action} ${r.createdAt.toISOString().slice(0,10)}`));
const s = await c.query(`SELECT t.slug,
 (SELECT count(*) FROM "Client" x WHERE x."tenantId"=t.id)::int clientes,
 (SELECT min(x."createdAt") FROM "Client" x WHERE x."tenantId"=t.id) cli_desde,
 (SELECT max(x."createdAt") FROM "Client" x WHERE x."tenantId"=t.id) cli_hasta,
 (SELECT count(*) FROM "CashSession" x WHERE x."tenantId"=t.id)::int turnos_caja
 FROM "Tenant" t WHERE t.slug IN ('supermercado','gsg','magra','comerciante','quebienoles','adosmanos','shinevelas','breakpoint') ORDER BY t.slug`).catch(e=>({rows:[{err:e.message}]}));
console.log(s.rows);
const col = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Tenant' ORDER BY 1`);
console.log(col.rows.map(r=>r.column_name).join(","));
const m = await c.query(`SELECT o.id,o.total,o.channel,o."paymentMethod"::text pm,o."createdAt",o."customerName",m.reason,m.type::text ty,m.method::text me,m.amount,m."createdBy" FROM "Tenant" t LEFT JOIN "Order" o ON o."tenantId"=t.id LEFT JOIN "CashMovement" m ON m."tenantId"=t.id WHERE t.slug='supermercado'`);
console.log(m.rows);
await c.query("ROLLBACK"); await c.end();
