// S2 (31/10) — SÓLO LECTURA contra Neon prod. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const q = async (t, s) => { try { const r = await c.query(s); console.log(t, JSON.stringify(r.rows)); } catch (e) { console.log(t, "ERR", e.message); } };
await q("links", `SELECT t.slug,a.action,a.changes->>'modo' modo,count(*)::int n,max(a."createdAt")::date ult FROM "AuditLog" a JOIN "Tenant" t ON t.id=a."tenantId" WHERE a.action IN ('link-de-pago','mp-modo-legado') GROUP BY 1,2,3 ORDER BY 1`);
await q("payments-mp", `SELECT t.slug,count(*)::int n FROM "Payment" p JOIN "Tenant" t ON t.id=p."tenantId" WHERE p."mpPaymentId" IS NOT NULL OR p."mpPreferenceId" IS NOT NULL GROUP BY 1`);
await q("force", `SELECT count(*) FILTER (WHERE relrowsecurity)::int rls,count(*) FILTER (WHERE relforcerowsecurity)::int force FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`);
await q("rol-app", `SELECT rolname,rolbypassrls FROM pg_roles WHERE rolname IN ('app_rls','neondb_owner')`);
await q("miembro", `SELECT pg_has_role(current_user,'app_rls','SET') puede_set`);
await c.query("ROLLBACK"); await c.end();
