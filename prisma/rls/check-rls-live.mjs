// Auditoría RLS EN VIVO (drift operativo) — ADR-018. SOLO LECTURA.
//
//   RLS_AUDIT_DATABASE_URL="postgres://…neon.tech/neondb" node prisma/rls/check-rls-live.mjs
//
// Complementa a check-coverage.mjs (que es ESTÁTICO, sobre schema.prisma). Esta
// red corre contra una base VIVA (branch de Neon o prod) y caza el drift que la
// estática no puede: una tabla que TIENE columna `tenantId` pero a la que —en esa
// base— nunca se le aplicó `ENABLE ROW LEVEL SECURITY` + policy `tenant_isolation`.
// Fue justo lo que pasó en prod (2026-07-05): 0001 se aplicó una vez sobre 24
// tablas y las 9 tablas nuevas (Order/Invoice/Cash*/Stock*/OutboxEvent) quedaron
// sin proteger. También verifica que `app_user`, si existe, NO tenga BYPASSRLS.
//
// Es SOLO LECTURA (pg_class / pg_policies / information_schema / pg_roles): segura
// de correr contra prod. Exit 0 = sin drift; Exit 1 = hay tablas sin proteger o el
// rol app_user evade RLS.

import pg from "pg";

const url = process.env.RLS_AUDIT_DATABASE_URL;
if (!url) {
  console.error(
    "❌ Falta RLS_AUDIT_DATABASE_URL.\n" +
      "   Uso: RLS_AUDIT_DATABASE_URL=\"<connection string del branch o prod>\" \\\n" +
      "        node prisma/rls/check-rls-live.mjs\n" +
      "   (Solo lectura — segura contra prod. No imprime el string.)",
  );
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
let failed = false;

try {
  await client.connect();

  // Tablas de-tenant = las que tienen columna `tenantId`.
  const cols = await client.query(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema='public' AND column_name='tenantId' ORDER BY table_name`,
  );
  const withTenant = cols.rows.map((r) => r.table_name);

  // RLS habilitado (pg_class.relrowsecurity) y policy tenant_isolation (pg_policies).
  const rls = await client.query(
    `SELECT relname FROM pg_class
     WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity=true`,
  );
  const pol = await client.query(
    `SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='tenant_isolation'`,
  );
  const rlsSet = new Set(rls.rows.map((r) => r.relname));
  const polSet = new Set(pol.rows.map((r) => r.tablename));

  const missingRls = withTenant.filter((t) => !rlsSet.has(t));
  const missingPol = withTenant.filter((t) => !polSet.has(t));

  console.log(`Tablas de-tenant (con columna tenantId): ${withTenant.length}`);
  console.log(`  con RLS habilitado:            ${withTenant.length - missingRls.length}/${withTenant.length}`);
  console.log(`  con policy tenant_isolation:   ${withTenant.length - missingPol.length}/${withTenant.length}`);

  if (missingRls.length) {
    failed = true;
    console.error(`\n❌ SIN RLS habilitado (${missingRls.length}): ${missingRls.join(", ")}`);
  }
  if (missingPol.length) {
    failed = true;
    console.error(`❌ SIN policy tenant_isolation (${missingPol.length}): ${missingPol.join(", ")}`);
  }
  if (missingRls.length || missingPol.length) {
    console.error(
      `\n   → drift: estas tablas filtrarían datos entre tenants. Re-correr\n` +
        `     prisma/rls/0001_enable_rls.sql (data-driven → las cubre todas).`,
    );
  }

  // app_user, si existe, NO debe tener BYPASSRLS (si no, evade todas las policies).
  const role = await client.query(
    `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname='app_user'`,
  );
  if (role.rows.length === 0) {
    console.log(`\napp_user: no existe todavía (se crea con 0002_app_role.sql).`);
  } else if (role.rows[0].rolbypassrls || role.rows[0].rolsuper) {
    failed = true;
    console.error(
      `\n❌ app_user EVADE RLS (bypassrls=${role.rows[0].rolbypassrls}, super=${role.rows[0].rolsuper}).\n` +
        `   → re-correr 0002_app_role.sql (fuerza NOBYPASSRLS aunque el rol ya exista).`,
    );
  } else {
    console.log(`\n✅ app_user existe y NO evade RLS (bypassrls=false, super=false).`);
  }

  console.log(failed ? "\nRESULTADO: HAY DRIFT ❌" : "\nRESULTADO: SIN DRIFT — cobertura RLS completa ✅");
} catch (e) {
  failed = true;
  console.error("❌ Error auditando:", e.code || "", (e.message || "").slice(0, 140));
} finally {
  await client.end().catch(() => {});
}

process.exit(failed ? 1 : 0);
