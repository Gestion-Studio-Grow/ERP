// Test de INTEGRACIÓN del cableado RLS de la app (ADR-018) contra PGlite sobre
// un socket pg-wire. A diferencia de verify-rls.mjs (que prueba las policies con
// SQL crudo), esto ejercita el CÓDIGO REAL: el cliente Prisma generado + la
// extensión de src/lib/rls.ts + tenantTransaction + la resolución de tenant.
//
//   tsx prisma/rls/verify-wiring.mts
//
// Qué prueba (con el flag RLS_ENFORCEMENT=on):
//   1. Aislamiento con el cliente Prisma REAL + las policies + rol app_rls
//      (shim SET LOCAL ROLE, porque PGlite conecta como superusuario que hace
//      bypass de RLS; en prod el bypass lo da rotar DATABASE_URL a app_rls).
//   2. El contexto por request (runInTenantContext, ALS) le provee el tenant a
//      la extensión REAL sin llamar a getCurrentTenantId (camino multi-tenant).
//   3. Self-resolución: con UN solo tenant, la extensión y tenantTransaction
//      resuelven el tenant solos (getCurrentTenantId) — el caso del go-live.
//   4. tenantTransaction REAL setea app.current_tenant_id como PRIMER statement.
//
// El aislamiento "puro" (sin shim de rol) ya está en verify-rls.mjs / el test de
// copia. Acá el foco es que el CÓDIGO de cableado hace lo correcto.

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync } from "node:fs";

const PORT = 5459;
const results: [boolean, string, string?][] = [];
const ok = (n: string) => results.push([true, n]);
const bad = (n: string, d = "") => results.push([false, n, d]);

const pg = new PGlite();
await pg.waitReady;
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });
await server.start();

try {
  await pg.exec(`
    CREATE TABLE "Tenant" (
      id text PRIMARY KEY, name text, slug text UNIQUE, timezone text,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Client" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, name text NOT NULL,
      phone text NOT NULL, "createdAt" timestamptz DEFAULT now(),
      "updatedAt" timestamptz DEFAULT now()
    );
  `);
  await pg.exec(readFileSync("prisma/rls/0001_enable_rls.sql", "utf8"));
  await pg.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_rls') THEN
        CREATE ROLE app_rls NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO app_rls;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;
  `);
  await pg.exec(`
    INSERT INTO "Tenant"(id,name,slug,timezone) VALUES
      ('t_caro','Carolina','carolina','UTC'),
      ('t_otro','Otro','otro','UTC');
    INSERT INTO "Client"(id,"tenantId",name,phone) VALUES
      ('c_caro','t_caro','Cliente Caro','111'),
      ('c_otro','t_otro','Cliente Otro','222');
  `);

  // Env ANTES de importar el cableado (prisma-base lee DATABASE_URL al evaluarse).
  process.env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.RLS_ENFORCEMENT = "on";

  const { prisma } = await import("@/lib/db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  const { basePrisma } = await import("@/lib/prisma-base");

  // ── 1. AISLAMIENTO: cliente real + policies + rol app_rls (shim de rol) ──────
  // (con 2 tenants) ctx=Caro conectando como app_rls → solo se ve a Caro.
  {
    const rows = await basePrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_rls`;
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', 't_caro', true)`;
      return tx.client.findMany({ select: { tenantId: true } });
    });
    const seen = rows.map((r) => r.tenantId);
    if (seen.length === 1 && seen[0] === "t_caro")
      ok("aislamiento (cliente real + policies + app_rls): ctx=Caro ve SOLO a Caro");
    else bad("aislamiento", `vio [${seen.join(",")}]`);
  }

  // ── 2. Contexto por request (ALS) alimenta la extensión REAL (con 2 tenants) ──
  // Callback ASYNC que await-ea dentro del scope → el store sobrevive a la parte
  // async de la op lazy de Prisma. La extensión usa store.tenantId (NO llama a
  // getCurrentTenantId, que con 2 tenants lanzaría) → corre sin romperse.
  {
    try {
      const rows = await runInTenantContext("t_caro", async () =>
        prisma.client.findMany({ select: { id: true } }),
      );
      ok(`runInTenantContext alimenta la extensión REAL sin getCurrentTenantId (${rows.length} filas)`);
    } catch (e) {
      bad("runInTenantContext → extensión", (e as Error).message.slice(0, 80));
    }
  }

  // Pasamos a UN solo tenant (estado del go-live).
  await pg.exec(`DELETE FROM "Client" WHERE id='c_otro'; DELETE FROM "Tenant" WHERE id='t_otro';`);

  // ── 3. SELF-RESOLUCIÓN: la extensión REAL resuelve el tenant sola (sin ctx) ───
  {
    const rows = await prisma.client.findMany({ select: { tenantId: true } });
    if (Array.isArray(rows) && rows.length === 1 && rows[0].tenantId === "t_caro")
      ok("self-resolución: la extensión REAL envuelve la lectura y resuelve el tenant sin ctx");
    else bad("self-resolución read", `devolvió ${JSON.stringify(rows)}`);
  }

  // ── 4. tenantTransaction REAL setea el GUC como PRIMER statement ──────────────
  {
    const r = await tenantTransaction((tx) =>
      tx.$queryRaw<{ t: string | null }[]>`SELECT current_setting('app.current_tenant_id', true) AS t`,
    );
    if (r?.[0]?.t === "t_caro")
      ok("tenantTransaction REAL: setea app.current_tenant_id dentro de la tx (self-resuelto)");
    else bad("tenantTransaction GUC", `current_setting = ${JSON.stringify(r?.[0]?.t)}`);
  }

  // ── 4b. tenantTransaction con tenantId EXPLÍCITO (path del worker) ────────────
  {
    const r = await tenantTransaction(
      (tx) => tx.$queryRaw<{ t: string | null }[]>`SELECT current_setting('app.current_tenant_id', true) AS t`,
      { tenantId: "t_caro" },
    );
    if (r?.[0]?.t === "t_caro") ok("tenantTransaction con tenantId explícito: setea el GUC correcto");
    else bad("tenantTransaction explícito", `current_setting = ${JSON.stringify(r?.[0]?.t)}`);
  }
} finally {
  await server.stop();
  await pg.close();
}

console.log("\n── Test de integración del cableado RLS ──────────────────");
let allOk = true;
for (const [good, name, detail] of results) {
  console.log(`${good ? "✅" : "❌"} ${name}${!good && detail ? `  (${detail})` : ""}`);
  if (!good) allOk = false;
}
console.log("──────────────────────────────────────────────────────────");
console.log(allOk ? "RESULTADO: TODO EN VERDE" : "RESULTADO: HAY FALLOS");
process.exit(allOk ? 0 : 1);
