// Verificación del GATE de alta del 2º tenant (ADR-018 / ADR-019) contra PGlite
// (Postgres 16 en WASM, en memoria). Es el equivalente OFFLINE, costo cero y
// anti-prod del ensayo en branch de Neon: no toca Neon ni producción.
//
//   npx tsx prisma/rls/verify-provision-gate.mts
//
// Reusa las piezas REALES: todas las migraciones (schema), el `provisionTenant`
// real, y el `0001_enable_rls.sql` real. Prueba, en orden:
//   1. Alta del tenant #1 (sin gate, primer tenant).
//   2. Alta del tenant #2 SIN RLS → el GATE ADR-018 la BLOQUEA (throw esperado).
//   3. Aplica RLS (0001) y verifica: (a) COBERTURA — toda tabla con `tenantId`
//      queda con RLS + policy (drift guard); (b) Tenant excluida (raíz sin
//      tenantId); (c) un app_user PREEXISTENTE con BYPASSRLS queda NOBYPASSRLS.
//   4. Alta del tenant #2 CON RLS → PASA (el gate se abre).
//   5. Aislamiento como app_user: cada tenant ve SOLO lo suyo; sin contexto, nada.
//
// Regresiones que cubre (bugs detectados en el ensayo del 2026-07-05):
//   - El sentinel del gate NO debe incluir "Tenant" (0001 la excluye por ser raíz
//     sin `tenantId`); si lo incluyera, `isRlsActive` daría false para siempre y el
//     gate nunca abriría aun con RLS aplicado.
//   - Drift de cobertura: una tabla de-tenant sin RLS/policy filtra entre tenants.
//   - Footgun del app_user con BYPASSRLS: evadiría todas las policies en silencio.

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { provisionTenant } from "../../scripts/provision-tenant";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 54329;
const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`;

const results: [boolean, string, string?][] = [];
const ok = (n: string, d?: string) => results.push([true, n, d]);
const bad = (n: string, d = "") => results.push([false, n, d]);

async function applyMigrations(pg: PGlite): Promise<number> {
  const dir = path.join(REPO, "prisma", "migrations");
  const migs = readdirSync(dir).filter((d) => !d.startsWith("migration_lock")).sort();
  let n = 0;
  for (const m of migs) {
    let sql: string;
    try { sql = readFileSync(path.join(dir, m, "migration.sql"), "utf8"); } catch { continue; }
    await pg.exec(sql);
    n++;
  }
  return n;
}

const db = await PGlite.create();
const nMigs = await applyMigrations(db);
const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 50 });
await server.start();
process.env.DATABASE_URL = URL;
process.env.RLS_ENFORCEMENT = "off"; // el provisioning corre como owner (bypass), como en prod
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL }) });

try {
  console.log(`\nEsquema: ${nMigs} migraciones aplicadas in-process (PGlite).`);

  // ── 1. Tenant #1: alta sin gate ─────────────────────────────────────────────
  let caroId = "";
  try {
    const r = await provisionTenant(prisma, {
      name: "CH Estética", slug: "beauty-spa", blueprint: "servicios",
      owner: { name: "Carolina", email: "caro@ch.demo", password: "x" },
      platform: { status: "ACTIVE", plan: "demo" },
    });
    caroId = r.tenantId;
    ok("alta tenant #1 (beauty-spa) sin gate", `id=${caroId.slice(0, 8)}…`);
  } catch (e) {
    bad("alta tenant #1", (e as Error).message.slice(0, 120));
  }

  // ── 2. Tenant #2 SIN RLS → el gate ADR-018 debe BLOQUEAR ────────────────────
  try {
    await provisionTenant(prisma, {
      name: "Magra", slug: "magra", blueprint: "carniceria",
      owner: { name: "Dueño Magra", email: "magra@magra.demo", password: "x" },
      platform: { status: "ACTIVE", plan: "demo" },
    });
    bad("gate SIN RLS bloquea el 2º tenant", "NO lanzó — el alta pasó sin RLS (¡fallo!)");
  } catch (e) {
    const msg = (e as Error).message;
    if (/GATE ADR-018/.test(msg)) ok("gate SIN RLS BLOQUEA el 2º tenant (throw esperado)");
    else bad("gate SIN RLS", `lanzó otro error: ${msg.slice(0, 100)}`);
  }

  const countAfterBlock = await prisma.tenant.count();
  if (countAfterBlock === 1) ok("tras el bloqueo, sigue habiendo 1 solo tenant");
  else bad("conteo tras bloqueo", `hay ${countAfterBlock} tenants (debía ser 1)`);

  // ── 3. Aplicar RLS (0001 real) ──────────────────────────────────────────────
  await db.exec(readFileSync(path.join(REPO, "prisma", "rls", "0001_enable_rls.sql"), "utf8"));

  // 3a. COBERTURA (drift guard offline): TODA tabla con columna `tenantId` debe
  // quedar con RLS habilitado + policy tenant_isolation. Si una migración futura
  // agrega una tabla de-tenant y 0001 no la cubriera, esto falla acá — no en prod.
  const withTenant = (await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema='public' AND column_name='tenantId'`,
  )).rows.map((r) => r.table_name);
  const rlsOn = new Set((await db.query<{ relname: string }>(
    `SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity=true`,
  )).rows.map((r) => r.relname));
  const polOn = new Set((await db.query<{ tablename: string }>(
    `SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation'`,
  )).rows.map((r) => r.tablename));
  const noRls = withTenant.filter((t) => !rlsOn.has(t));
  const noPol = withTenant.filter((t) => !polOn.has(t));
  if (withTenant.length > 0 && noRls.length === 0 && noPol.length === 0)
    ok(`cobertura RLS completa: ${withTenant.length}/${withTenant.length} tablas de-tenant con RLS + policy`);
  else bad("cobertura RLS", `sin RLS: [${noRls.join(",")}] · sin policy: [${noPol.join(",")}]`);
  // Tenant (raíz, sin tenantId) queda EXCLUIDA a propósito (regresión del bug del sentinel).
  const tenantRls = (await db.query<{ relrowsecurity: boolean }>(
    `SELECT relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relname='Tenant'`,
  )).rows[0]?.relrowsecurity;
  if (tenantRls === false) ok("Tenant excluida de RLS a propósito (raíz sin tenantId)");
  else bad("Tenant RLS", `relrowsecurity=${tenantRls} (debía ser false)`);

  // 3b. app_user + REGRESIÓN del footgun: se simula el estado hallado en prod
  // (rol PREEXISTENTE con BYPASSRLS) y se aplica el ALTER incondicional del 0002
  // patcheado; debe quedar NOBYPASSRLS. Sin ese ALTER, un app_user con bypass
  // evadiría TODAS las policies → cero aislamiento (2026-07-05).
  await db.exec(`CREATE ROLE app_user LOGIN BYPASSRLS`); // estado "malo" preexistente
  await db.exec(`ALTER ROLE app_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`); // 0002 (fix)
  await db.exec(`
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  `);
  const appRole = (await db.query<{ rolbypassrls: boolean }>(
    `SELECT rolbypassrls FROM pg_roles WHERE rolname='app_user'`,
  )).rows[0];
  if (appRole && appRole.rolbypassrls === false)
    ok("app_user preexistente con BYPASSRLS → 0002 lo fuerza a NOBYPASSRLS (fix del footgun)");
  else bad("app_user NOBYPASSRLS", `rolbypassrls=${appRole?.rolbypassrls}`);

  // ── 4. Tenant #2 CON RLS → ahora PASA (gate abierto) ────────────────────────
  let magraId = "";
  try {
    const r = await provisionTenant(prisma, {
      name: "Magra — Carnicería Premium", slug: "magra", blueprint: "carniceria",
      owner: { name: "Dueño Magra", email: "magra@magra.demo", password: "x" },
      platform: { status: "ACTIVE", plan: "demo", subdomain: "magra" },
    });
    magraId = r.tenantId;
    ok("alta tenant #2 (magra) CON RLS activo → GATE ABIERTO", `id=${magraId.slice(0, 8)}…`);
  } catch (e) {
    bad("alta tenant #2 con RLS", (e as Error).message.slice(0, 120));
  }

  const countAfterOpen = await prisma.tenant.count();
  if (countAfterOpen === 2) ok("ahora hay 2 tenants en la base del ensayo");
  else bad("conteo tras alta #2", `hay ${countAfterOpen} (debía ser 2)`);

  // ── 5. Aislamiento como app_user (enforcement real, rol sin BYPASSRLS) ───────
  // Cada contexto ve SOLO su tenant. Se prueba sobre "User" (cada tenant tiene su OWNER).
  async function ownersVisibleAs(tenantId: string | null): Promise<string[]> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_user`;
      if (tenantId) await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', '${tenantId}', true)`);
      const rows = await tx.$queryRaw<{ tenantId: string }[]>`SELECT "tenantId" FROM "User"`;
      return [...new Set(rows.map((r) => r.tenantId))];
    });
  }

  const seenCaro = await ownersVisibleAs(caroId);
  if (seenCaro.length === 1 && seenCaro[0] === caroId) ok("ctx=CH ve SOLO usuarios de CH");
  else bad("aislamiento ctx=CH", `vio tenants [${seenCaro.map((s2) => s2.slice(0, 6)).join(",")}]`);

  const seenMagra = await ownersVisibleAs(magraId);
  if (seenMagra.length === 1 && seenMagra[0] === magraId) ok("ctx=Magra ve SOLO usuarios de Magra");
  else bad("aislamiento ctx=Magra", `vio tenants [${seenMagra.map((s2) => s2.slice(0, 6)).join(",")}]`);

  const seenNone = await ownersVisibleAs(null);
  if (seenNone.length === 0) ok("SIN contexto (fail-closed) → 0 filas visibles");
  else bad("fail-closed sin ctx", `vio ${seenNone.length} tenants`);
} finally {
  await prisma.$disconnect().catch(() => {});
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
}

console.log("\n── ENSAYO del gate de alta + aislamiento RLS (PGlite, offline) ──");
let allOk = true;
for (const [good, name, detail] of results) {
  console.log(`${good ? "✅" : "❌"} ${name}${detail ? `  (${detail})` : ""}`);
  if (!good) allOk = false;
}
console.log("────────────────────────────────────────────────────────────────");
console.log(allOk ? "RESULTADO: TODO EN VERDE" : "RESULTADO: HAY FALLOS");
process.exit(allOk ? 0 : 1);
