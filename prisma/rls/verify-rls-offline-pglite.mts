// Verificación de AISLAMIENTO RLS contra Postgres REAL (PGlite), SIN Neon — ADR-018.
//
//   tsx prisma/rls/verify-rls-offline-pglite.mts
//
// POR QUÉ EXISTE: el ensayo canónico (verify-rls.mjs + check-rls-live.mjs) exige un
// branch de Neon y `psql`. Cuando no hay acceso a Neon (sin NEON_API_KEY / neonctl /
// psql), este verificador corre las MISMAS aserciones de aislamiento contra PGlite
// (Postgres compilado a WASM: RLS, roles, policies y set_config funcionan de verdad),
// más los ángulos que el dueño pidió explícitamente y que verify-wiring no cubría:
//   A. lectura aislada por ctx de tenant
//   B. lectura POR ID de otro tenant → 0 filas (no se puede pescar por id)
//   C. lectura con JOIN/relación (equivalente a un include de Prisma) → solo el propio
//   D. WITH CHECK en INSERT: crear fila con tenantId ajeno estando en ctx propio → RECHAZADO
//   E. UPDATE cross-tenant: mover una fila al tenant ajeno → BLOQUEADO
//   F. FAIL-CLOSED: sin setear el GUC, no se ve NADA
//   G. NO-FILTRADO POR CONEXIÓN REUTILIZADA (el riesgo clásico Neon+pooler): tras una
//      transacción con ctx=A en una conexión, la SIGUIENTE transacción en la MISMA
//      conexión física, sin volver a setear el GUC, NO ve nada de A. Prueba que
//      set_config(...,true) es transaction-scoped y NO se filtra entre requests que
//      comparten conexión por el pooler en modo transacción.
//
// NO reemplaza el ensayo en vivo contra Neon (pooler real / pgbouncer). Lo COMPLEMENTA
// con evidencia dura del mecanismo cuando Neon no está disponible en la sesión.
// La app se simula con `SET LOCAL ROLE app_rls` (current_user ≠ owner → RLS aplica),
// igual que verify-rls.mjs. Un solo pg.Client = una sola conexión física (ideal para G).

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import pg from "pg";
import { readFileSync } from "node:fs";

const PORT = 5461;
const A = "rls_off_A";
const B = "rls_off_B";
const results: [boolean, string, string?][] = [];
const ok = (n: string) => results.push([true, n]);
const bad = (n: string, d = "") => results.push([false, n, d]);

const lite = new PGlite();
await lite.waitReady;
const server = new PGLiteSocketServer({ db: lite, port: PORT, host: "127.0.0.1" });
await server.start();

const db = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${PORT}/postgres` });

// Corre `fn` en una transacción como app_rls con ctx de tenant `tenantId` (o sin ctx
// si es null). SIEMPRE cierra con ROLLBACK: no deja rastro de las pruebas de escritura.
async function asApp<T>(tenantId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL ROLE app_rls");
    if (tenantId !== null) {
      await db.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    }
    return await fn();
  } finally {
    await db.query("ROLLBACK");
  }
}

try {
  // Esquema mínimo: Tenant (raíz, excluida de RLS) + Client + Note (hija con tenantId
  // y FK a Client) — Note habilita el test de JOIN/relación (like Prisma include).
  await lite.exec(`
    CREATE TABLE "Tenant" (
      id text PRIMARY KEY, name text, slug text UNIQUE, timezone text,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Client" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, name text NOT NULL, phone text NOT NULL,
      "createdAt" timestamptz DEFAULT now(), "updatedAt" timestamptz DEFAULT now()
    );
    CREATE TABLE "Note" (
      id text PRIMARY KEY, "tenantId" text NOT NULL, "clientId" text NOT NULL, body text NOT NULL,
      "createdAt" timestamptz DEFAULT now()
    );
  `);

  // Policies data-driven de producción (0001) — cubre Client y Note por tener tenantId.
  await lite.exec(readFileSync("prisma/rls/0001_enable_rls.sql", "utf8"));

  // Rol app_rls (nace NOBYPASSRLS) + grants DML, igual que 0002 (sin el ALTER que Neon
  // rechaza; en PGlite conectamos como superuser y usamos SET LOCAL ROLE para simular la app).
  await lite.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_rls') THEN
        CREATE ROLE app_rls NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO app_rls;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;
  `);

  // Semilla como owner (bypassa RLS por ownership): 2 tenants, 1 client + 1 note c/u.
  await lite.exec(`
    INSERT INTO "Tenant"(id,name,slug,timezone) VALUES
      ('${A}','RLS Off A','rls-off-a','UTC'), ('${B}','RLS Off B','rls-off-b','UTC');
    INSERT INTO "Client"(id,"tenantId",name,phone) VALUES
      ('cli_a','${A}','Cliente A','111'), ('cli_b','${B}','Cliente B','222');
    INSERT INTO "Note"(id,"tenantId","clientId",body) VALUES
      ('note_a','${A}','cli_a','Nota privada de A'), ('note_b','${B}','cli_b','Nota privada de B');
  `);

  await db.connect();
  await db.query("GRANT app_rls TO CURRENT_USER"); // para poder SET ROLE app_rls desde el owner

  // ── A. Lectura aislada ───────────────────────────────────────────────────────
  await asApp(A, async () => {
    const { rows } = await db.query(`SELECT "tenantId" FROM "Client"`);
    const seen = rows.map((r) => r.tenantId);
    if (seen.length === 1 && seen[0] === A) ok("A. lectura aislada: ctx=A ve SOLO filas de A");
    else bad("A. lectura aislada", `vio [${seen.join(",")}]`);
  });

  // ── B. Lectura POR ID del otro tenant → 0 filas (no se pesca por id) ──────────
  await asApp(A, async () => {
    const { rows } = await db.query(`SELECT id FROM "Client" WHERE id='cli_b'`);
    if (rows.length === 0) ok("B. por-ID: ctx=A NO puede leer el Client de B ni pidiéndolo por id");
    else bad("B. por-ID", `devolvió ${rows.length} fila(s) del tenant B`);
  });

  // ── C. JOIN/relación (equivalente a un include de Prisma) → solo lo propio ────
  await asApp(A, async () => {
    const { rows } = await db.query(
      `SELECT n.body, n."tenantId" FROM "Client" c JOIN "Note" n ON n."clientId" = c.id`,
    );
    const tenants = [...new Set(rows.map((r) => r.tenantId))];
    if (rows.length === 1 && tenants.length === 1 && tenants[0] === A)
      ok("C. include/JOIN: ctx=A ve SOLO las notas de A al cruzar relaciones");
    else bad("C. include/JOIN", `vio filas de [${tenants.join(",")}] (${rows.length})`);
  });

  // ── D. WITH CHECK: INSERT con tenantId=B estando en ctx=A → RECHAZADO ─────────
  await asApp(A, async () => {
    try {
      await db.query(
        `INSERT INTO "Client"(id,"tenantId",name,phone) VALUES ('cli_evil',$1,'Intruso','000')`,
        [B],
      );
      bad("D. WITH CHECK insert", "se permitió insertar fila de otro tenant (¡leak!)");
    } catch (e) {
      if (/row-level security/i.test((e as Error).message))
        ok("D. WITH CHECK: INSERT con tenantId ajeno RECHAZADO");
      else bad("D. WITH CHECK insert", `falló por otro motivo: ${(e as Error).message.slice(0, 80)}`);
    }
  });

  // ── E. UPDATE cross-tenant: mover fila de A a tenantId=B → BLOQUEADO ──────────
  await asApp(A, async () => {
    try {
      const res = await db.query(`UPDATE "Client" SET "tenantId"=$1 WHERE id='cli_a'`, [B]);
      if (res.rowCount === 0) ok("E. UPDATE cross-tenant: 0 filas afectadas (bloqueado por USING/WITH CHECK)");
      else bad("E. UPDATE cross-tenant", `movió ${res.rowCount} fila(s) a otro tenant`);
    } catch (e) {
      if (/row-level security/i.test((e as Error).message))
        ok("E. UPDATE cross-tenant: RECHAZADO por WITH CHECK");
      else bad("E. UPDATE cross-tenant", `falló por otro motivo: ${(e as Error).message.slice(0, 80)}`);
    }
  });

  // ── F. FAIL-CLOSED: sin GUC no se ve nada ────────────────────────────────────
  await asApp(null, async () => {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "Client"`);
    if (rows[0].n === 0) ok("F. fail-closed: sin contexto de tenant, SELECT devuelve 0 filas");
    else bad("F. fail-closed", `sin contexto se vieron ${rows[0].n} filas`);
  });

  // ── G. NO-FILTRADO POR CONEXIÓN REUTILIZADA (riesgo Neon+pooler) ─────────────
  // La MISMA conexión física (`db`) que acaba de correr transacciones con ctx=A.
  // Una NUEVA transacción, sin volver a setear el GUC, NO debe ver nada de A: prueba
  // que set_config(...,true) es transaction-scoped y no persiste entre requests que
  // comparten conexión por el pooler en modo transacción. Primero confirmamos que la
  // conexión "recuerda" A DENTRO de su tx; luego que en la SIGUIENTE tx ya no.
  await asApp(A, async () => {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "Client"`);
    if (rows[0].n === 1) ok("G1. dentro de la tx con ctx=A: ve su fila (contexto activo)");
    else bad("G1. contexto activo", `vio ${rows[0].n} filas`);
  });
  // Nueva transacción en la MISMA conexión, sin set_config → debe fail-closed.
  await asApp(null, async () => {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "Client"`);
    if (rows[0].n === 0)
      ok("G2. conexión reutilizada: la tx siguiente SIN set_config ve 0 filas (el GUC de A NO se filtró)");
    else bad("G2. no-filtrado por conexión", `la conexión reutilizada filtró ${rows[0].n} filas de la tx anterior`);
  });
} finally {
  await db.end().catch(() => {});
  await server.stop();
  await lite.close();
}

console.log("\n── Aislamiento RLS offline (PGlite, sin Neon) ─────────────");
let allOk = true;
for (const [good, name, detail] of results) {
  console.log(`${good ? "✅" : "❌"} ${name}${!good && detail ? `  (${detail})` : ""}`);
  if (!good) allOk = false;
}
console.log("──────────────────────────────────────────────────────────");
console.log(allOk ? "RESULTADO: TODO EN VERDE" : "RESULTADO: HAY FALLOS");
process.exit(allOk ? 0 : 1);
