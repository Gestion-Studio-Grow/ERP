// Verificación READ-ONLY de aislamiento por tenant en una base con RLS activo.
// Prod-safe: NO escribe, NO cambia privilegios (sin GRANT/ALTER), NO crea datos.
// Todo lo que hace son SELECTs y, para el test funcional, un `SET LOCAL ROLE app_rls`
// dentro de una transacción que SIEMPRE se revierte (ROLLBACK).
//
//   DATABASE_URL="<owner>" node prisma/rls/verify-tenant-isolation.mjs [slug1 slug2 ...]
//
// Qué valida, por cada slug pedido (default: todos menos el "ajeno" de control):
//   A. NIVEL CATÁLOGO (siempre): la policy `tenant_isolation` existe sobre la tabla
//      y RLS está ENABLED → el aislamiento estructural cubre a ese tenant.
//   B. NIVEL FUNCIONAL (si el owner puede `SET ROLE app_rls`): simulando la app,
//      con ctx=propio ve sólo lo suyo, con ctx ajeno NO ve sus filas, y sin ctx ve
//      0 (fail-closed). Si el owner no es miembro de app_rls, se saltea B (no falla)
//      y queda A como evidencia — sin tocar privilegios.

import pg from "pg";

const CTRL_SLUG = "beauty-spa"; // tenant de control ("ajeno")
// Tabla de-tenant representativa por tenant a verificar (donde tiene filas sembradas).
const TABLE_FOR = { shinevelas: "Product", adosmanos: "Service", magra: "Product" };
const DEFAULT_TABLE = "Client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (rol owner).");
  process.exit(2);
}

const c = new pg.Client({ connectionString: url });
await c.connect();

const { rows: tenants } = await c.query('SELECT id, slug FROM "Tenant" ORDER BY "createdAt"');
const bySlug = Object.fromEntries(tenants.map((t) => [t.slug, t.id]));
const control = bySlug[CTRL_SLUG];

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const slugs = wanted.length ? wanted : tenants.map((t) => t.slug).filter((s) => s !== CTRL_SLUG);

// ¿El owner puede simular la app? SET LOCAL ROLE app_rls dentro de una tx que se revierte.
let canSimulate = true;
await c.query("BEGIN");
try {
  await c.query("SET LOCAL ROLE app_rls");
} catch {
  canSimulate = false;
}
await c.query("ROLLBACK");

async function policyOn(table) {
  const { rows } = await c.query(
    `SELECT
       (SELECT count(*)::int FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname='tenant_isolation') AS pol,
       (SELECT relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=$1) AS rls`,
    [table],
  );
  return { policy: rows[0].pol > 0, rls: rows[0].rls === true };
}
async function ownerCount(tenantId, table) {
  const { rows } = await c.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "tenantId"=$1`, [tenantId]);
  return rows[0].n;
}
async function countAs(ctx, table, extraWhere = "") {
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL ROLE app_rls");
    if (ctx) await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [ctx]);
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM "${table}" ${extraWhere}`);
    return rows[0].n;
  } finally {
    await c.query("ROLLBACK");
  }
}

console.log(`Aislamiento por tenant · simulación app_rls: ${canSimulate ? "disponible" : "no (owner no es miembro; solo nivel catálogo)"}\n`);
let allPass = true;
for (const slug of slugs) {
  const id = bySlug[slug];
  if (!id) { console.log(`- ${slug}: NO existe, se saltea`); continue; }
  const table = TABLE_FOR[slug] ?? DEFAULT_TABLE;
  const { policy, rls } = await policyOn(table);
  let line = `${slug} (${table}): policy=${policy ? "sí" : "NO"} rls=${rls ? "on" : "OFF"}`;
  let pass = policy && rls;
  if (canSimulate) {
    const real = await ownerCount(id, table);
    const own = await countAs(id, table);
    const ownForeign = await countAs(id, table, `WHERE "tenantId" <> '${id}'`);
    const fromCtrl = await countAs(control, table, `WHERE "tenantId" = '${id}'`);
    const noCtx = await countAs(null, table);
    const funcPass = own === real && real > 0 && ownForeign === 0 && fromCtrl === 0 && noCtx === 0;
    pass = pass && funcPass;
    line += ` | propio=${own}/${real} ajeno-visto=${ownForeign} desde-control=${fromCtrl} sin-ctx=${noCtx}`;
  }
  console.log(`  ${pass ? "🟢" : "🔴"} ${line}`);
  allPass = allPass && pass;
}
console.log(`\n${allPass ? "🟢 TODOS AISLADOS" : "🔴 REVISAR"}`);
await c.end();
process.exit(allPass ? 0 : 1);
