// Red ESTÁTICA de cobertura RLS — ADR-018. Corre sin tocar la base (CI / sesión).
//
//   node prisma/rls/check-coverage.mjs
//
// La migración 0001_enable_rls.sql es data-driven: le pone policy a TODA tabla
// con columna `tenantId`. El agujero que ESO no cubre es un modelo que pertenece
// a un tenant pero al que le falta la columna `tenantId` escalar — quedaría sin
// forma de ser aislado y sería un leak silencioso. Este chequeo lo caza:
//
//   Para cada modelo con `tenant Tenant @relation(...)`  →  DEBE tener `tenantId String`.
//
// Además imprime el set que la migración va a proteger y las exclusiones
// deliberadas, para que un revisor vea el alcance de un vistazo.
//
// SEGUNDA RED — RLS VIAJA CON LA MIGRACIÓN (desde 20260925120000_lanzamiento_base, R0-F1).
// 0001 se corre a mano: una base armada sólo con migraciones dejaba sin aislar toda tabla nueva
// hasta que alguien se acordara (CODEMAP §5: 1 de 44 tablas). Desde esa migración en adelante,
// toda `CREATE TABLE` con columna "tenantId" tiene que prender RLS y crear la política
// `tenant_isolation` EN LA MISMA migración: `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY` +
// `CREATE POLICY tenant_isolation ON "X"`, o el bucle `FOREACH … IN ARRAY ARRAY['X', …]` que
// hace las dos cosas (el de 20260925120000_lanzamiento_base). Las anteriores al corte quedan
// cubiertas por 0001, como siempre.
//
// Exit 0 = todo modelo de-tenant es protegible y ninguna tabla nueva nace sin RLS.
// Exit 1 = hay un modelo sin tenantId o una migración que crea una tabla de negocio sin RLS.
//
// Para probarlo sobre otros archivos: RLS_SCHEMA_PATH y RLS_MIGRATIONS_DIR
// (src/lib/rls-cobertura-migraciones.test.ts).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(process.env.RLS_SCHEMA_PATH ?? join(here, "..", "schema.prisma"), "utf8");
const MIGRATIONS_DIR = process.env.RLS_MIGRATIONS_DIR ?? join(here, "..", "migrations");
/** Desde esta migración (inclusive), RLS tiene que venir adentro de la migración. */
const CORTE_RLS_EN_MIGRACION = "20260925120000";

// "Tenant" es la raíz (no lleva tenantId, se lee pre-contexto). No es un leak.
const ROOT_MODEL = "Tenant";

const protectable = []; // modelos con tenantId → los protege la policy
const orphan = []; // modelos que pertenecen a un tenant pero SIN columna tenantId

for (const [, name, body] of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  if (name === ROOT_MODEL) continue;
  const belongsToTenant = /^\s*tenant\s+Tenant\s+@relation/m.test(body);
  const hasTenantIdColumn = /^\s*tenantId\s+String/m.test(body);
  if (hasTenantIdColumn) protectable.push(name);
  else if (belongsToTenant) orphan.push(name);
}

console.log(`Modelos protegidos por la policy (tienen tenantId): ${protectable.length}`);
console.log(`  ${protectable.sort().join(", ")}`);
console.log(`\nExcluido a propósito: ${ROOT_MODEL} (raíz del aislamiento) · ` +
  `_ProfessionalServices (join M2M sin tenantId, protegido transitivamente)`);

// ── Segunda red: cada migración desde el corte protege las tablas de negocio que crea ──────────
/** Tablas con "tenantId" que crea un migration.sql, y las que ese mismo archivo protege. */
function rlsDeLaMigracion(sql) {
  const creadas = [];
  for (const [, tabla, cuerpo] of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"\s*\(([\s\S]*?)\n\);/g)) {
    if (/"tenantId"/.test(cuerpo)) creadas.push(tabla);
  }
  const conRls = new Set([...sql.matchAll(/ALTER TABLE\s+"(\w+)"\s+ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1]));
  const conPolitica = new Set([...sql.matchAll(/CREATE POLICY tenant_isolation ON\s+"(\w+)"/g)].map((m) => m[1]));
  // El bucle: un bloque DO que recorre una lista y hace las dos cosas con format('%I').
  for (const [bloque] of sql.matchAll(/DO \$\$[\s\S]*?\$\$/g)) {
    const lista = /FOREACH\s+\w+\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\]/.exec(bloque);
    if (!lista) continue;
    const nombres = [...lista[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const prende = /ENABLE ROW LEVEL SECURITY/.test(bloque);
    const politica = /CREATE POLICY tenant_isolation ON %I/.test(bloque) && /current_setting\(''app\.current_tenant_id'', true\)/.test(bloque);
    for (const n of nombres) {
      if (prende) conRls.add(n);
      if (politica) conPolitica.add(n);
    }
  }
  return { creadas, sinRls: creadas.filter((t) => !conRls.has(t) || !conPolitica.has(t)) };
}

const migracionesSinRls = [];
let revisadas = 0;
if (existsSync(MIGRATIONS_DIR)) {
  for (const dir of readdirSync(MIGRATIONS_DIR).sort()) {
    if (dir.slice(0, CORTE_RLS_EN_MIGRACION.length) < CORTE_RLS_EN_MIGRACION) continue;
    const archivo = join(MIGRATIONS_DIR, dir, "migration.sql");
    if (!existsSync(archivo)) continue;
    revisadas++;
    const { sinRls } = rlsDeLaMigracion(readFileSync(archivo, "utf8"));
    for (const t of sinRls) migracionesSinRls.push(`${dir}: ${t}`);
  }
}
console.log(`\nMigraciones desde ${CORTE_RLS_EN_MIGRACION} revisadas (RLS adentro de la migración): ${revisadas}`);

let falla = false;
if (orphan.length) {
  console.error(
    `\n❌ Modelos que pertenecen a un tenant pero NO tienen columna \`tenantId\`:\n` +
      `   - ${orphan.join("\n   - ")}\n` +
      `   → sin esa columna la policy RLS no puede aislarlos. Agregá \`tenantId String\`\n` +
      `     + su @relation, o documentá por qué es la raíz.`,
  );
  falla = true;
}
if (migracionesSinRls.length) {
  console.error(
    `\n❌ Migraciones que crean una tabla con "tenantId" sin prenderle RLS y la política tenant_isolation:\n` +
      `   - ${migracionesSinRls.join("\n   - ")}\n` +
      `   → en la MISMA migración: ALTER TABLE "X" ENABLE ROW LEVEL SECURITY y\n` +
      `     CREATE POLICY tenant_isolation ON "X" USING/WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)).`,
  );
  falla = true;
}
if (falla) process.exit(1);

console.log(`\n✅ Todo modelo de-tenant es protegible por RLS (tiene tenantId) y ninguna tabla nueva nace sin RLS.`);
process.exit(0);
