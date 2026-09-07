// ATAQUE 1 — a nivel BASE DE DATOS. ¿El backstop RLS aísla dos tenants reales?
//
// Aplica 0001 (policies) + 0002 (rol app_rls) sobre la base local de aislamiento,
// se GRANTea app_rls a la sesión (para poder SET ROLE), y desde el rol app_rls
// (NOBYPASSRLS) intenta, en el contexto del tenant B:
//   R1. leer filas del tenant A                 → debe ver 0
//   R2. leer con contexto propio (B)            → debe ver las de B
//   W1. INSERT de una fila con tenantId=A       → WITH CHECK debe RECHAZAR
//   W2. UPDATE por id de una fila de A          → debe afectar 0 filas
//   W3. DELETE por id de una fila de A          → debe afectar 0 filas
//   N1. SIN contexto de tenant, SELECT          → debe ver 0 (fail-closed)
//   N2. SIN contexto, UPDATE por id de A        → debe afectar 0
// Toda escritura corre en transacciones que SIEMPRE hacen ROLLBACK.
//
//   DATABASE_URL="postgresql://postgres@127.0.0.1:5433/erp_val" node prisma/rls/aislamiento-ataque-db.mjs
//
// Exit 0 = aislado (backstop aguanta). Exit 1 = FUGA.

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) { console.error("Falta DATABASE_URL"); process.exit(2); }
if (/neon\.tech|prod|production/i.test(url)) { console.error("Parece prod. Abortado."); process.exit(2); }

const A = "cmtq4yf120000gh7dl8q2cjfs"; // beauty-spa
const B = "B_tenant";

const c = new pg.Client({ connectionString: url });
await c.connect();

const results = [];
const check = (name, ok, detail = "") => { results.push([ok, name, detail]); };

async function asAppRls(tenantId, fn) {
  await c.query("BEGIN");
  try {
    await c.query("SET LOCAL ROLE app_rls");
    if (tenantId !== null) await c.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantId]);
    return await fn();
  } finally {
    await c.query("ROLLBACK");
  }
}

try {
  // --- Aplicar migraciones RLS (idempotentes) ---
  // 0001 tal cual (data-driven, a prueba de drift).
  await c.query(readFileSync(join(here, "0001_enable_rls.sql"), "utf8"));
  // 0002 hardcodea `neondb_owner` (rol de Neon). En la base local el owner es
  // `postgres`, así que replicamos el MISMO rol app_rls (LOGIN NOBYPASSRLS, no owner,
  // solo DML) con el owner local. Semánticamente idéntico a 0002.
  const owner = (await c.query("SELECT current_user AS u")).rows[0].u;
  await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_rls') THEN CREATE ROLE app_rls LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$`);
  await c.query("GRANT USAGE ON SCHEMA public TO app_rls");
  await c.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls");
  await c.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rls");
  await c.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls`);
  await c.query("GRANT app_rls TO CURRENT_USER");

  // Confirmar estado de enforcement.
  const role = await c.query("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname='app_rls'");
  const nrls = await c.query("SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity");
  const npol = await c.query("SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation'");
  console.log(`Estado: app_rls bypassrls=${role.rows[0]?.rolbypassrls} super=${role.rows[0]?.rolsuper} | tablas con RLS=${nrls.rows[0].n} | policies=${npol.rows[0].n}\n`);

  const realA = (await c.query('SELECT count(*)::int n FROM "Client" WHERE "tenantId"=$1', [A])).rows[0].n;
  const realB = (await c.query('SELECT count(*)::int n FROM "Client" WHERE "tenantId"=$1', [B])).rows[0].n;

  // R1: en contexto B, leer clientes de A.
  await asAppRls(B, async () => {
    const seenA = (await c.query('SELECT count(*)::int n FROM "Client" WHERE "tenantId"=$1', [A])).rows[0].n;
    check("R1 lectura cross-tenant (ctx=B lee Clients de A)", seenA === 0, `vio ${seenA} de ${realA}`);
    // Lectura por id conocido de A (nombre secreto).
    const rowA = await c.query(`SELECT name FROM "Client" WHERE id='cli_01'`);
    check("R1b lectura por id de A (ctx=B)", rowA.rowCount === 0, `filas=${rowA.rowCount}`);
  });

  // R2: en contexto B, ver lo propio.
  await asAppRls(B, async () => {
    const seenB = (await c.query('SELECT count(*)::int n FROM "Client"')).rows[0].n;
    check("R2 lectura propia (ctx=B ve sus Clients)", seenB === realB && realB > 0, `vio ${seenB}/${realB}`);
  });

  // W1: INSERT con tenantId=A desde ctx=B → WITH CHECK.
  await asAppRls(B, async () => {
    try {
      await c.query(`INSERT INTO "Client"(id,"tenantId",name,phone,"createdAt","updatedAt") VALUES ('evil',$1,'intruso','0',now(),now())`, [A]);
      check("W1 INSERT cross-tenant (tenantId=A, ctx=B)", false, "se permitio el INSERT — FUGA");
    } catch (e) {
      check("W1 INSERT cross-tenant rechazado", /row-level security/i.test(e.message), e.message.slice(0, 80));
    }
  });

  // W2: UPDATE por id de A desde ctx=B.
  await asAppRls(B, async () => {
    const r = await c.query(`UPDATE "Client" SET name='HACKEADO' WHERE id='cli_01'`);
    check("W2 UPDATE por id de A (ctx=B) no afecta", r.rowCount === 0, `rowCount=${r.rowCount}`);
  });

  // W3: DELETE por id de A desde ctx=B.
  await asAppRls(B, async () => {
    const r = await c.query(`DELETE FROM "Client" WHERE id='cli_01'`);
    check("W3 DELETE por id de A (ctx=B) no afecta", r.rowCount === 0, `rowCount=${r.rowCount}`);
  });

  // N1: sin contexto, SELECT.
  await asAppRls(null, async () => {
    const n = (await c.query('SELECT count(*)::int n FROM "Client"')).rows[0].n;
    check("N1 fail-closed lectura (sin ctx)", n === 0, `vio ${n}`);
  });

  // N2: sin contexto, UPDATE por id de A.
  await asAppRls(null, async () => {
    const r = await c.query(`UPDATE "Client" SET name='X' WHERE id='cli_01'`);
    check("N2 fail-closed UPDATE (sin ctx)", r.rowCount === 0, `rowCount=${r.rowCount}`);
  });

  // Verificar que A sigue intacto (ninguna escritura de arriba pego, todas revertidas).
  const nameA = (await c.query(`SELECT name FROM "Client" WHERE id='cli_01'`)).rows[0]?.name;
  check("Integridad: cli_01 de A intacto", nameA && nameA !== "HACKEADO", `name=${nameA}`);

  console.log("── ATAQUE 1 (nivel DB, rol app_rls NOBYPASSRLS + RLS on) ─────────");
  let allPass = true;
  for (const [ok, name, detail] of results) {
    console.log(`${ok ? "🟢 BLOQUEADO" : "🔴 FUGA    "} ${name}${detail ? "  ["+detail+"]" : ""}`);
    allPass = allPass && ok;
  }
  console.log("──────────────────────────────────────────────────────────────");
  console.log(allPass ? "🟢 AISLADO A NIVEL DB" : "🔴 HAY FUGA A NIVEL DB");
  await c.end();
  process.exit(allPass ? 0 : 1);
} catch (e) {
  console.error("Error inesperado:", e.message);
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  process.exit(1);
}
