// S2 (31/10) — SÓLO LECTURA contra Neon prod. No se commitea.
import fs from "node:fs";
import pg from "pg";
const env = fs.readFileSync("C:/Users/mlloveras2/Documents/Claude/Factory-GSG/estetica-erp/.env", "utf8");
const url = env.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)[1].replace("-pooler", "");
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("BEGIN TRANSACTION READ ONLY");
const q = async (t, s) => { try { const r = await c.query(s); console.log(t, JSON.stringify(r.rows)); } catch (e) { console.log(t, "ERR", e.message); } };
await q("rol", `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) bypass`);
await q("tablas", `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ProductBatch','ProcessingRun','ProcessingOutput','ApiKey','WebhookSuscripcion','EntregaWebhook','PlantillaWhatsapp','PagoExterno','ClubReservaIndice','IntegracionConexion','CarteraCliente') ORDER BY 1`);
await q("columnas", `SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='Product' AND column_name IN ('category','cost')) OR (table_name='OutboxEvent' AND column_name IN ('version','clave')) OR (table_name='Client' AND column_name='limiteCredito') OR (table_name='Order' AND column_name IN ('cobroVerificadoEn','cobroVerificadoPor')))`);
await q("enums", `SELECT t.typname,string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) v FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname IN ('PaymentMethod','UserRole','CashMethod') GROUP BY 1`);
await q("funciones", `SELECT proname FROM pg_proc WHERE proname LIKE 'gsg_%'`);
await q("outbox", `SELECT count(*)::int n,(SELECT pg_size_pretty(pg_total_relation_size('"OutboxEvent"'))) size FROM "OutboxEvent"`);
await q("create-public", `SELECT rolname FROM pg_roles WHERE has_schema_privilege(oid,'public','CREATE')`);
await q("mp-por-negocio", `SELECT t.slug,t.status::text st,COALESCE(t.modules,'{}')@>ARRAY['mercadopago'] mod,(SELECT count(*)::int FROM "IntegracionConexion" x WHERE x."tenantId"=t.id AND x.conector='mercadopago') con,(SELECT string_agg(x.estado::text,',') FROM "IntegracionConexion" x WHERE x."tenantId"=t.id AND x.conector='mercadopago') estado FROM "Tenant" t ORDER BY 1`);
await q("audit-mp", `SELECT action,changes->>'motivo' motivo,count(*)::int n,max("createdAt") ult FROM "AuditLog" WHERE entity='WebhookMercadoPago' GROUP BY 1,2`);
await c.query("ROLLBACK"); await c.end();
