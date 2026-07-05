// Test de RESOLUCIÓN DE TENANT POR REQUEST (ADR-018 §4) + aislamiento, contra
// PGlite sobre socket. Ejercita el código real: extractSubdomain, resolveTenantId
// (por subdominio, con fallback single-tenant y fail-closed) y que el tenant
// resuelto aísla vía las policies RLS.
//
//   tsx prisma/rls/verify-tenant-resolution.mts
//
// Prueba, con 2 tenants sintéticos (caro.<base>, magra.<base>):
//   1. extractSubdomain: apex/www/localhost/host-ajeno → null; sub.<base> → sub.
//   2. resolveTenantId(host): cada subdominio → SU tenant; apex/desconocido con 2
//      tenants → THROW (fail-closed).
//   3. Aislamiento: el tenantId resuelto ve SOLO lo suyo (policies + rol app_user).
//   4. Fallback single-tenant: con 1 tenant, apex → ese tenant.

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync } from "node:fs";

const PORT = 5461;
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
      id text PRIMARY KEY, name text, slug text UNIQUE, subdomain text UNIQUE,
      timezone text, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Client" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, name text NOT NULL,
      phone text NOT NULL, "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
  `);
  await pg.exec(readFileSync("prisma/rls/0001_enable_rls.sql", "utf8"));
  await pg.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_user') THEN
        CREATE ROLE app_user NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
  `);
  await pg.exec(`
    INSERT INTO "Tenant"(id,name,slug,subdomain,timezone) VALUES
      ('t_caro','Carolina','carolina','caro','UTC'),
      ('t_magra','Magra','magra','magra','UTC');
    INSERT INTO "Client"(id,"tenantId",name,phone) VALUES
      ('c_caro','t_caro','Cliente Caro','111'),
      ('c_magra','t_magra','Cliente Magra','222');
  `);

  process.env.APP_BASE_DOMAIN = "shop.test";
  process.env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${PORT}/postgres`;
  process.env.RLS_ENFORCEMENT = "on";

  const { extractSubdomain, resolveTenantId } = await import("@/lib/tenant");
  const { prisma } = await import("@/lib/db");
  const { runInTenantContext } = await import("@/lib/tenant-context");
  const { basePrisma } = await import("@/lib/prisma-base");

  // ── 1. extractSubdomain (puro) ───────────────────────────────────────────────
  {
    const cases: [string | null, string | null][] = [
      ["caro.shop.test", "caro"],
      ["magra.shop.test", "magra"],
      ["shop.test", null],
      ["www.shop.test", null],
      ["localhost:3000", null],
      ["deploy-preview-12--sitio.netlify.app", null],
      ["caro.shop.test:443", "caro"],
      [null, null],
    ];
    const fails = cases.filter(([h, exp]) => extractSubdomain(h) !== exp);
    if (fails.length === 0) ok(`extractSubdomain: ${cases.length}/${cases.length} casos correctos`);
    else bad("extractSubdomain", fails.map(([h]) => `${h}→${extractSubdomain(h)}`).join(", "));
  }

  // ── 2. resolveTenantId por subdominio ────────────────────────────────────────
  {
    const caro = await resolveTenantId("caro.shop.test");
    const magra = await resolveTenantId("magra.shop.test");
    if (caro === "t_caro" && magra === "t_magra")
      ok("resolveTenantId: cada subdominio resuelve a SU tenant");
    else bad("resolveTenantId subdominio", `caro=${caro} magra=${magra}`);
  }

  // ── 2b. Fail-closed: apex/desconocido con 2 tenants → THROW ───────────────────
  {
    let threwApex = false, threwUnknown = false;
    try { await resolveTenantId("shop.test"); } catch { threwApex = true; }
    try { await resolveTenantId("nadie.shop.test"); } catch { threwUnknown = true; }
    if (threwApex && threwUnknown)
      ok("fail-closed: apex (2 tenants) y subdominio inexistente → THROW");
    else bad("fail-closed", `apex threw=${threwApex} unknown threw=${threwUnknown}`);
  }

  // ── 3. Aislamiento: el tenant resuelto ve SOLO lo suyo (policies + app_user) ──
  // (a) la cadena real corre sin romperse; (b) el tenantId resuelto aísla.
  {
    // (a) chain real: resolver → runInTenantContext → extensión (superuser ve todo,
    //     pero prueba que corre sin recursión/error).
    const magraId = await resolveTenantId("magra.shop.test");
    const rows = await runInTenantContext(magraId, async () =>
      prisma.client.findMany({ select: { id: true } }),
    );
    const chainOk = Array.isArray(rows);

    // (b) aislamiento con el tenantId resuelto (rol app_user, shim de rol).
    const seenMagra = (
      await basePrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL ROLE app_user`;
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${magraId}, true)`;
        return tx.client.findMany({ select: { tenantId: true } });
      })
    ).map((r) => r.tenantId);

    const caroId = await resolveTenantId("caro.shop.test");
    const seenCaro = (
      await basePrisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL ROLE app_user`;
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${caroId}, true)`;
        return tx.client.findMany({ select: { tenantId: true } });
      })
    ).map((r) => r.tenantId);

    if (chainOk && seenMagra.length === 1 && seenMagra[0] === "t_magra" &&
        seenCaro.length === 1 && seenCaro[0] === "t_caro")
      ok("aislamiento: cada tenant resuelto ve SOLO lo suyo (magra→magra, caro→caro)");
    else bad("aislamiento", `chain=${chainOk} magra=[${seenMagra}] caro=[${seenCaro}]`);
  }

  // ── 4. Fallback single-tenant: con 1 tenant, apex → ese tenant ────────────────
  {
    await pg.exec(`DELETE FROM "Client" WHERE id='c_magra'; DELETE FROM "Tenant" WHERE id='t_magra';`);
    const t = await resolveTenantId("shop.test"); // apex, ahora 1 solo tenant
    if (t === "t_caro") ok("fallback single-tenant: apex con 1 tenant → ese tenant (compat Carolina)");
    else bad("fallback single-tenant", `resolvió ${t}`);
  }
} finally {
  await server.stop();
  await pg.close();
}

console.log("\n── Test de resolución de tenant por request ──────────────");
let allOk = true;
for (const [good, name, detail] of results) {
  console.log(`${good ? "✅" : "❌"} ${name}${!good && detail ? `  (${detail})` : ""}`);
  if (!good) allOk = false;
}
console.log("──────────────────────────────────────────────────────────");
console.log(allOk ? "RESULTADO: TODO EN VERDE" : "RESULTADO: HAY FALLOS");
process.exit(allOk ? 0 : 1);
