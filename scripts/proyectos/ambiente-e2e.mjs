// ============================================================================
// AMBIENTE E2E DE PROYECTOS (MIA-193) — Postgres REAL local, la app como `app_rls`.
// ============================================================================
//
// `demo-local.mjs` usa PGlite y se conecta como `postgres` (superusuario): RLS no corre y no sirve para
// certificar aislamiento. Esta variante arma lo mismo que producción, en esta máquina:
//
//   1. Base limpia `erp_e2e` (DROP + CREATE) en el Postgres local del arnés (5433, /tmp/pgrun), dueña `neondb_owner`.
//   2. `prisma migrate deploy` como `neondb_owner` y `prisma migrate status` (cuántas, en qué orden).
//   3. `prisma/rls/0002_app_role.sql` y `0001_enable_rls.sql`, tal cual (como el arnés de tests).
//   4. Siembra idempotente de 3 productoras vacías «de prueba» (`sembrar-e2e.mts`).
//   5. Prueba de aislamiento como `app_rls`: `select current_user` y leer otro negocio da 0 filas.
//   6. Con `--start`: `next start` (antes, `npm run build`) con DATABASE_URL y OPERATOR_DATABASE_URL = app_rls,
//      RLS_ENFORCEMENT=on y el negocio resuelto por host (`<slug>.localhost`).
//
//   node scripts/proyectos/ambiente-e2e.mjs            # base + siembra + prueba
//   node scripts/proyectos/ambiente-e2e.mjs --start    # además levanta la app compilada (puerto 3218)
//   node scripts/proyectos/ambiente-e2e.mjs --sembrar  # sólo re-siembra (idempotente) y prueba, sin borrar la base
//
// NUNCA toca Neon: la URL pasa por la guarda del seed (`src/lib/seed/guarda-base.ts`).

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVIDOR = process.env.ERP_TEST_PG_URL?.trim() || "postgresql://postgres@localhost:5433/postgres?host=/tmp/pgrun";
const BASE = process.env.E2E_DB ?? "erp_e2e";
const APP_PORT = Number(process.env.PORT ?? 3218);
const log = (m) => process.stdout.write(`[e2e] ${m}\n`);

const url = (rol, base) => {
  const u = new URL(SERVIDOR);
  if (rol) {
    u.username = rol;
    u.password = "";
  }
  u.pathname = `/${base}`;
  return u.toString();
};
const DUENIO = url("neondb_owner", BASE);
const APP = url("app_rls", BASE);

const local = (() => {
  const u = new URL(SERVIDOR);
  const host = u.searchParams.get("host") || u.hostname;
  return host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host);
})();
if (!local) throw new Error("ERP_TEST_PG_URL no es un Postgres de esta máquina: el ambiente E2E sólo corre local.");

const correr = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
  return { codigo: r.status ?? 1, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const sql = async (conexion, texto, params) => {
  const c = new pg.Client({ connectionString: conexion });
  await c.connect();
  try {
    return await c.query(texto, params);
  } finally {
    await c.end();
  }
};

const soloSembrar = process.argv.includes("--sembrar");

if (!soloSembrar) {
  const admin = url(null, "postgres");
  await sql(admin, `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
      CREATE ROLE neondb_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF; END $$`);
  await sql(admin, `DROP DATABASE IF EXISTS "${BASE}" WITH (FORCE)`);
  await sql(admin, `CREATE DATABASE "${BASE}" OWNER neondb_owner`);
  log(`base limpia ${BASE} (dueña neondb_owner)`);

  const prisma = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
  const env = { DATABASE_URL: DUENIO, MIGRATE_DATABASE_URL: DUENIO };
  const dep = correr(process.execPath, [prisma, "migrate", "deploy"], env);
  const aplicadas = [...dep.salida.matchAll(/^\s*└─ (\S+)|^\s*├─ (\S+)/gm)].map((m) => m[1] ?? m[2]);
  log(`migrate deploy: código ${dep.codigo} · ${dep.salida.match(/\d+ migrations? found/)?.[0] ?? "?"} · ${dep.salida.match(/All migrations have been successfully applied\.|No pending migrations to apply\./)?.[0] ?? "(ver salida)"}`);
  if (dep.codigo !== 0) {
    process.stdout.write(dep.salida);
    process.exit(1);
  }
  const orden = await sql(DUENIO, `SELECT migration_name, finished_at IS NOT NULL AS ok FROM _prisma_migrations ORDER BY finished_at, migration_name`);
  log(`_prisma_migrations: ${orden.rowCount} filas, ${orden.rows.filter((r) => r.ok).length} terminadas · primera ${orden.rows[0]?.migration_name} · última ${orden.rows.at(-1)?.migration_name}`);
  log(`orden de aplicación = orden alfabético de carpeta: ${orden.rows.every((r, i, a) => i === 0 || a[i - 1].migration_name < r.migration_name) ? "sí" : "NO"} (${new Set(aplicadas).size} distintas listadas por deploy)`);
  const st = correr(process.execPath, [prisma, "migrate", "status"], env);
  log(`migrate status: código ${st.codigo} · ${st.salida.match(/Database schema is up to date!|Following migration[^\n]*/)?.[0] ?? st.salida.trim().split("\n").at(-1)}`);

  const comoAdmin = url(null, BASE);
  for (const f of ["prisma/rls/0002_app_role.sql", "prisma/rls/0001_enable_rls.sql"]) await sql(comoAdmin, readFileSync(path.join(ROOT, f), "utf8"));
  log("RLS: 0002 (rol app_rls) y 0001 (políticas) aplicados");
}

const siembra = correr("npx", ["tsx", "scripts/proyectos/sembrar-e2e.mts"], { DATABASE_URL: DUENIO });
process.stdout.write(siembra.salida);
if (siembra.codigo !== 0) process.exit(1);

// ── Prueba de aislamiento como app_rls ───────────────────────────────────────
const c = new pg.Client({ connectionString: APP });
await c.connect();
try {
  const yo = (await c.query("select current_user, (select rolbypassrls from pg_roles where rolname = current_user) as bypass")).rows[0];
  log(`como app: current_user=${yo.current_user} · bypassrls=${yo.bypass}`);
  const negocios = (await sql(DUENIO, `SELECT id, slug FROM "Tenant" WHERE slug LIKE 'prueba-%' ORDER BY slug`)).rows;
  const uno = negocios.find((x) => x.slug === "prueba-uno");
  const dos = negocios.find((x) => x.slug === "prueba-dos");
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [uno.id]);
  const propios = (await c.query(`SELECT count(*)::int n FROM "User" WHERE "tenantId" = $1`, [uno.id])).rows[0].n;
  const ajenos = (await c.query(`SELECT count(*)::int n FROM "User" WHERE "tenantId" = $1`, [dos.id])).rows[0].n;
  const personasAjenas = (await c.query(`SELECT count(*)::int n FROM "ProyectoPersona" WHERE "tenantId" = $1`, [dos.id])).rows[0].n;
  await c.query("COMMIT");
  const sinContexto = (await c.query(`SELECT count(*)::int n FROM "User"`)).rows[0].n;
  log(`parado en ${uno.slug}: usuarios propios=${propios} · usuarios de ${dos.slug}=${ajenos} · fichas de ${dos.slug}=${personasAjenas} · sin negocio fijado=${sinContexto}`);
} finally {
  await c.end();
}

if (!process.argv.includes("--start")) process.exit(0);

const envApp = {
  DATABASE_URL: APP,
  OPERATOR_DATABASE_URL: APP,
  MIGRATE_DATABASE_URL: DUENIO,
  RLS_ENFORCEMENT: "on",
  APP_BASE_DOMAIN: "localhost",
  TZ: "America/Argentina/Buenos_Aires",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "ambiente-e2e-local-no-es-un-secreto-real-0123456789",
  OPERATOR_SECRET: process.env.OPERATOR_SECRET ?? "ambiente-e2e-operador-no-es-secreto-0123456789",
  // Sólo local: la consola del operador (re-provisionar). No es una clave real.
  OPERATOR_PASSWORD: process.env.OPERATOR_PASSWORD ?? "operador-e2e-local",
  MODULE_REGISTRY_ENABLED: "on",
  PORT: String(APP_PORT),
};
for (const v of ["FORCE_TENANT_SLUG", "TENANT_HOST_MAP", "DEMO_MODE_ENABLED"]) delete process.env[v];
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...envApp } });
log(`app en http://prueba-uno.localhost:${APP_PORT}/admin (también prueba-dos, prueba-tres)`);
const cerrar = () => {
  app.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
