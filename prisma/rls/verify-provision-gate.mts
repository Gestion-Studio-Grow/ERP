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
//   3. Aplica RLS (0001) + rol app_user sin BYPASSRLS.
//   4. Alta del tenant #2 CON RLS → PASA (el gate se abre).
//   5. Aislamiento como app_user: cada tenant ve SOLO lo suyo; sin contexto, nada.
//
// Regresión que cubre: el sentinel del gate NO debe incluir "Tenant" (0001 la
// excluye por ser la raíz sin `tenantId`); si lo incluyera, `isRlsActive` daría
// false para siempre y el gate nunca abriría aun con RLS aplicado (bug detectado
// en el ensayo del 2026-07-05).

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

  // ── 3. Aplicar RLS (0001 real) + rol app_user ───────────────────────────────
  await db.exec(readFileSync(path.join(REPO, "prisma", "rls", "0001_enable_rls.sql"), "utf8"));
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_user') THEN
        CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  `);
  // Semántica correcta: Appointment/Client (de-tenant) → RLS ON; Tenant (raíz, sin
  // tenantId) → OFF a propósito (0001 la excluye). Es justo lo que el sentinel del
  // gate NO debe exigir en true.
  const s = await db.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT relname, relrowsecurity FROM pg_class
     WHERE relnamespace='public'::regnamespace AND relname = ANY($1)`,
    [["Tenant", "Appointment", "Client"]],
  );
  const by = Object.fromEntries(s.rows.map((r) => [r.relname, r.relrowsecurity]));
  if (by.Appointment === true && by.Client === true && by.Tenant === false)
    ok("RLS ON en Appointment/Client; Tenant excluida a propósito (raíz sin tenantId)");
  else bad("RLS activo (semántica)", JSON.stringify(s.rows));

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
