// Sólo lectura: qué negocios cambiaron de módulos desde el ensayo S2. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
if (!new URL(url).hostname.startsWith("ep-little-credit-act3cxpe.")) throw new Error("No es prod: corto.");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("SET default_transaction_read_only = on");
const col = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='Tenant' AND column_name IN ('updatedAt','createdAt','status')`)).rows.map((x) => x.column_name);
console.log("columnas:", col.join(","));
const r = await c.query(`SELECT slug, ${col.includes("updatedAt") ? `"updatedAt"` : "NULL"} AS upd, array_to_string(COALESCE(modules,'{}'),',') AS mods FROM "Tenant" ORDER BY slug`);
for (const f of r.rows) console.log(f.slug, "|", f.upd ? new Date(f.upd).toISOString() : "-", "|", f.mods);
const a = await c.query(`SELECT "createdAt", action, entity, "tenantId" FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 5`);
for (const f of a.rows) console.log("audit", new Date(f.createdAt).toISOString(), f.action, f.entity, f.tenantId);
await c.end();
