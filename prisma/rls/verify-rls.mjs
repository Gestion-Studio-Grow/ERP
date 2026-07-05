// Verificación FUNCIONAL de RLS — ADR-018 (ensayo obligatorio en branch de Neon).
// Prueba, contra una base REAL con 0001+0002 aplicados, que las policies aíslan
// por tenant. NO corre contra producción: exige una URL de branch explícita y se
// niega si coincide con la DATABASE_URL de prod.
//
// Uso (en la branch de ensayo, NUNCA en prod):
//   RLS_VERIFY_DATABASE_URL="postgres://neondb_owner:...@ep-...branch...neon.tech/neondb" \
//     node prisma/rls/verify-rls.mjs
//
// Requisitos previos en esa branch:
//   psql "$RLS_VERIFY_DATABASE_URL" -f prisma/rls/0001_enable_rls.sql
//   psql "$RLS_VERIFY_DATABASE_URL" -v app_pw=una_pw_de_ensayo -f prisma/rls/0002_app_role.sql
//
// Qué valida (con dos tenants sintéticos y la tabla "Client"):
//   1. LECTURA aislada: con ctx=A se ven filas de A y NO de B.
//   2. WITH CHECK: con ctx=A, INSERT de una fila con tenantId=B es RECHAZADO.
//   3. UPDATE cross-tenant: con ctx=A, mover una fila de A a tenantId=B es RECHAZADO.
//   4. FAIL-CLOSED: sin setear el GUC, SELECT devuelve 0 filas.
// La app se simula con `SET LOCAL ROLE app_user` (current_user ≠ owner → RLS aplica).

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { Client } = pg;

// ── Guardas anti-producción ─────────────────────────────────────────────────
const url = process.env.RLS_VERIFY_DATABASE_URL;
if (!url) {
  console.error(
    "❌ Falta RLS_VERIFY_DATABASE_URL. Este script SOLO corre contra una branch\n" +
      "   de Neon de ensayo, nunca contra prod. Ver el encabezado del archivo.",
  );
  process.exit(2);
}
// Si coincide con la DATABASE_URL de prod del .env, abortar.
try {
  const here = dirname(fileURLToPath(import.meta.url));
  const env = readFileSync(join(here, "..", "..", ".env"), "utf8");
  const prod = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)?.[1]?.trim();
  if (prod && url.trim() === prod) {
    console.error("❌ RLS_VERIFY_DATABASE_URL == DATABASE_URL de prod. Abortado.");
    process.exit(2);
  }
} catch {
  /* sin .env legible: seguimos, la URL explícita ya es la guarda principal */
}

const A = "rls_test_tenant_A";
const B = "rls_test_tenant_B";
const results = [];
const pass = (name) => results.push([true, name]);
const fail = (name, detail) => results.push([false, `${name} — ${detail}`]);

const db = new Client({ connectionString: url });

// Corre `fn` en una transacción como app_user con ctx de tenant `tenantId`
// (o sin ctx si es null). Devuelve lo que devuelva fn; siempre hace ROLLBACK
// para no dejar rastro de las pruebas de escritura.
async function asApp(tenantId, fn) {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL ROLE app_user");
    if (tenantId !== null) {
      await db.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    }
    return await fn();
  } finally {
    await db.query("ROLLBACK");
  }
}

async function main() {
  await db.connect();

  // Para poder `SET ROLE app_user` desde el owner del branch.
  await db.query("GRANT app_user TO CURRENT_USER");

  // Semilla como owner (bypassa RLS por ownership): 2 tenants + 1 client c/u.
  await db.query("BEGIN");
  await db.query(
    `INSERT INTO "Tenant"(id,name,slug,timezone,"createdAt","updatedAt")
     VALUES ($1,'RLS Test A','rls-test-a','UTC',now(),now()),
            ($2,'RLS Test B','rls-test-b','UTC',now(),now())
     ON CONFLICT (id) DO NOTHING`,
    [A, B],
  );
  await db.query(
    `INSERT INTO "Client"(id,"tenantId",name,phone,"createdAt","updatedAt")
     VALUES ('rls_client_a',$1,'Cliente A','111',now(),now()),
            ('rls_client_b',$2,'Cliente B','222',now(),now())
     ON CONFLICT (id) DO NOTHING`,
    [A, B],
  );
  await db.query("COMMIT");

  // 1. LECTURA aislada con ctx=A.
  await asApp(A, async () => {
    const { rows } = await db.query(
      `SELECT "tenantId" FROM "Client" WHERE id IN ('rls_client_a','rls_client_b')`,
    );
    const seen = rows.map((r) => r.tenantId);
    if (seen.length === 1 && seen[0] === A) pass("lectura aislada: ctx=A ve solo filas de A");
    else fail("lectura aislada", `esperaba [${A}], obtuvo [${seen.join(",")}]`);
  });

  // 2. WITH CHECK: insertar con tenantId=B mientras ctx=A → rechazado.
  await asApp(A, async () => {
    try {
      await db.query(
        `INSERT INTO "Client"(id,"tenantId",name,phone,"createdAt","updatedAt")
         VALUES ('rls_client_evil',$1,'Intruso','000',now(),now())`,
        [B],
      );
      fail("WITH CHECK insert", "se permitió insertar fila de otro tenant (¡leak!)");
    } catch (e) {
      if (/row-level security/i.test(e.message)) pass("WITH CHECK: INSERT cross-tenant rechazado");
      else fail("WITH CHECK insert", `falló por otro motivo: ${e.message}`);
    }
  });

  // 3. UPDATE cross-tenant: mover fila de A a tenantId=B con ctx=A → rechazado.
  await asApp(A, async () => {
    try {
      const res = await db.query(
        `UPDATE "Client" SET "tenantId"=$1 WHERE id='rls_client_a'`,
        [B],
      );
      if (res.rowCount === 0) pass("UPDATE cross-tenant: 0 filas afectadas (bloqueado)");
      else fail("UPDATE cross-tenant", `movió ${res.rowCount} fila(s) a otro tenant`);
    } catch (e) {
      if (/row-level security/i.test(e.message)) pass("UPDATE cross-tenant: rechazado por WITH CHECK");
      else fail("UPDATE cross-tenant", `falló por otro motivo: ${e.message}`);
    }
  });

  // 4. FAIL-CLOSED: sin GUC, no se ve nada.
  await asApp(null, async () => {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "Client"`);
    if (rows[0].n === 0) pass("fail-closed: sin contexto, SELECT devuelve 0 filas");
    else fail("fail-closed", `sin contexto se vieron ${rows[0].n} filas`);
  });

  // Limpieza (como owner).
  await db.query(`DELETE FROM "Client" WHERE id IN ('rls_client_a','rls_client_b','rls_client_evil')`);
  await db.query(`DELETE FROM "Tenant" WHERE id IN ($1,$2)`, [A, B]);

  // Reporte.
  console.log("\n── Verificación RLS ──────────────────────────────────────");
  let allOk = true;
  for (const [ok, name] of results) {
    console.log(`${ok ? "✅" : "❌"} ${name}`);
    if (!ok) allOk = false;
  }
  console.log("──────────────────────────────────────────────────────────");
  process.exit(allOk ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Error inesperado:", e.message);
  try {
    await db.query("ROLLBACK");
  } catch {}
  process.exit(1);
});
