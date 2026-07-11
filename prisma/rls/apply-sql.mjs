// Aplicador de .sql sobre un BRANCH de Neon usando `pg` (NO psql) — ADR-018.
//
//   RLS_APPLY_DATABASE_URL="postgres://…branch…neon.tech/neondb" \
//     node prisma/rls/apply-sql.mjs prisma/rls/0001_enable_rls.sql
//
// POR QUÉ EXISTE: el runbook (levantar-gate-rls-2do-tenant.md) aplica los SQL con
// `psql -f`. En entornos SIN psql (este es uno: no hay psql ni neonctl), este runner
// aplica el MISMO archivo .sql con el cliente `pg`, que ya es dependencia del repo.
// Ejecuta el script completo en UNA sola sentencia (los .sql de prisma/rls/ envuelven
// su propio BEGIN/COMMIT y bloques DO $$…$$).
//
// ── GUARDAS ANTI-PRODUCCIÓN (dobles, fail-closed) ───────────────────────────────
//   1. Exige la var DEDICADA `RLS_APPLY_DATABASE_URL`. NO lee DATABASE_URL: así NUNCA
//      puede apuntar a prod por defecto/descuido.
//   2. Si el valor coincide con el DATABASE_URL de prod del .env → ABORTA.
// Es la misma disciplina que verify-rls.mjs. Aun así: usalo SOLO contra un branch
// desechable de Neon, jamás contra prod (el cutover a prod lo hace el dueño, Gate 2).

import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const url = process.env.RLS_APPLY_DATABASE_URL;
const file = process.argv[2];

if (!url || !file) {
  console.error(
    "❌ Uso: RLS_APPLY_DATABASE_URL=\"<connection string del BRANCH>\" \\\n" +
      "        node prisma/rls/apply-sql.mjs <ruta.sql>\n" +
      "   Solo contra un branch de Neon de ensayo, NUNCA prod. No imprime el string.",
  );
  process.exit(2);
}

// Guarda: si coincide con el DATABASE_URL de prod del .env, abortar.
try {
  const here = dirname(fileURLToPath(import.meta.url));
  const env = readFileSync(join(here, "..", "..", ".env"), "utf8");
  const prod = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)?.[1]?.trim();
  if (prod && url.trim() === prod) {
    console.error("❌ RLS_APPLY_DATABASE_URL == DATABASE_URL de prod. Abortado (guarda anti-prod).");
    process.exit(2);
  }
} catch {
  /* sin .env legible: seguimos; la var dedicada ya es la guarda principal */
}

const sql = readFileSync(resolve(file), "utf8");
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });

try {
  await client.connect();
  await client.query(sql);
  console.log(`✅ Aplicado: ${file}`);
  process.exit(0);
} catch (e) {
  console.error(`❌ Error aplicando ${file}:`, e.code || "", (e.message || "").slice(0, 200));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
