// Manual de caja (31/10) — SÓLO LECTURA contra Neon prod. No se commitea. No lee hashes ni claves.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const t = await c.query(`
 SELECT t.id, t.slug, t.subdomain, t.name, t.status::text, t."blueprintId" bp, t.modules,
  (SELECT count(*) FROM "Order" o WHERE o."tenantId"=t.id)::int pedidos,
  (SELECT count(*) FROM "Order" o WHERE o."tenantId"=t.id AND o.paid)::int cobrados,
  (SELECT max(o."createdAt") FROM "Order" o WHERE o."tenantId"=t.id) ult_pedido,
  (SELECT count(*) FROM "CashMovement" m WHERE m."tenantId"=t.id)::int libro,
  (SELECT count(*) FROM "AuditLog" a WHERE a."tenantId"=t.id AND a.action='caja.cierre-diario')::int cierres,
  (SELECT count(*) FROM "Appointment" a WHERE a."tenantId"=t.id)::int turnos,
  (SELECT count(*) FROM "Product" p WHERE p."tenantId"=t.id)::int productos
 FROM "Tenant" t ORDER BY t.slug`);
const u = await c.query(`SELECT "tenantId", email, role::text, name FROM "User" ORDER BY "tenantId", role, email`);
const i = await c.query(`SELECT DISTINCT ON ("tenantId","entityId") "tenantId","entityId",action FROM "AuditLog" WHERE entity='Interruptor' AND "entityId" IN ('diseno-nuevo','mostrador-boutique') ORDER BY "tenantId","entityId","createdAt" DESC`);
const e = await c.query(`SELECT (SELECT count(*) FROM "Order" WHERE "paymentMethod"::text IN ('DEBITO','CREDITO'))::int pedidos,(SELECT count(*) FROM "Collection" WHERE method::text IN ('DEBITO','CREDITO'))::int cobros,(SELECT count(*) FROM "CashMovement" WHERE method::text='TRANSFERENCIA')::int libro`);
await c.query("ROLLBACK"); await c.end();
for (const r of t.rows) {
  console.log(`\n${r.slug} [${r.subdomain}] "${r.name}" ${r.status} bp=${r.bp} mp=${(r.modules||[]).includes("mercadopago")} caja=${(r.modules||[]).join(",").slice(0,90)}`);
  console.log(`  pedidos ${r.pedidos} cobrados ${r.cobrados} últ ${r.ult_pedido?.toISOString().slice(0,10)} libro ${r.libro} cierres ${r.cierres} turnos ${r.turnos} productos ${r.productos}`);
  console.log(`  flags: ${i.rows.filter(x=>x.tenantId===r.id).map(x=>x.entityId+":"+x.action.split(".")[1]).join(" ")||"-"}`);
  console.log(`  users: ${u.rows.filter(x=>x.tenantId===r.id).map(x=>x.email+"("+x.role+")").join(", ")}`);
}
console.log("\nregla vuelta atrás:", e.rows[0]);
