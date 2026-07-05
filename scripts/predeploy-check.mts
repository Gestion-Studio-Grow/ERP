// ============================================================================
// CHEQUEO PRE-DEPLOY — drift entre el código y la base destino
// ============================================================================
//   npm run predeploy-check
//
// Antes de publicar, verifica que la base DESTINO tenga TODO lo que el código
// espera. Si el código consulta una columna/tabla que no existe en la base (una
// migración sin aplicar), al desplegar se ROMPE el cliente en vivo. Este check
// atrapa ese caso ANTES del deploy y falla (exit 1) con un mensaje claro.
//
// Qué compara (SOLO LECTURA del catálogo — no toca ni lee datos de negocio):
//   (a) MIGRACIONES: carpetas en prisma/migrations/ vs filas aplicadas en
//       _prisma_migrations. Migración sin aplicar → drift.
//   (b) COLUMNAS: tablas/columnas que declara schema.prisma vs las que existen
//       en information_schema de la base destino. Columna esperada que falta → drift.
//   (Columnas de MÁS en la base no fallan: la base puede ir adelante del código.)
//
// Base destino (en orden de preferencia):
//   PREDEPLOY_DATABASE_URL  › DATABASE_URL (.env)
// Es seguro apuntarlo a prod: solo corre SELECTs sobre information_schema y
// _prisma_migrations. Overrides para test: PREDEPLOY_SCHEMA_PATH, PREDEPLOY_MIGRATIONS_DIR.
//
// Exit 0 = base al día (deploy seguro). Exit 1 = drift (NO deployar). Exit 2 = error de uso.
// ============================================================================

import "dotenv/config";
import pg from "pg";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SCALAR_TYPES = new Set([
  "String", "Boolean", "Int", "BigInt", "Float", "Decimal", "DateTime", "Json", "Bytes",
]);

/** host del connection string, enmascarado (sin credenciales). */
function maskedHost(url: string): string {
  try {
    return new URL(url).host || "(host desconocido)";
  } catch {
    return "(host desconocido)";
  }
}

// ── Parseo de schema.prisma → tablas/columnas esperadas ──────────────────────
function parseExpectedColumns(schema: string): Map<string, Set<string>> {
  // Los enums cuentan como tipos escalares (una columna de ese enum SÍ existe).
  const enums = new Set<string>();
  for (const m of schema.matchAll(/enum\s+(\w+)\s*\{/g)) enums.add(m[1]);

  const tables = new Map<string, Set<string>>();
  for (const [, model, body] of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const cols = new Set<string>();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@") || line.startsWith("}")) continue;
      const m = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(line);
      if (!m) continue;
      const [, field, baseType] = m;
      // Es COLUMNA si el tipo base es escalar o un enum. Si es otro modelo (relación),
      // NO es columna (la columna es el FK escalar, declarado en su propia línea).
      if (SCALAR_TYPES.has(baseType) || enums.has(baseType)) cols.add(field);
    }
    tables.set(model, cols);
  }
  return tables;
}

/** Corre el chequeo y devuelve el exit code (0=al día, 1=drift, 2=error de uso). */
export async function check(): Promise<number> {
  // Env leído acá (no al importar) para ser testeable con distintos targets.
  const SCHEMA_PATH = process.env.PREDEPLOY_SCHEMA_PATH ?? join(ROOT, "prisma", "schema.prisma");
  const MIGRATIONS_DIR = process.env.PREDEPLOY_MIGRATIONS_DIR ?? join(ROOT, "prisma", "migrations");
  const TARGET_URL = process.env.PREDEPLOY_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!TARGET_URL) {
    console.error("❌ Falta la base destino. Seteá PREDEPLOY_DATABASE_URL o DATABASE_URL (.env).");
    return 2;
  }
  if (!existsSync(SCHEMA_PATH)) {
    console.error(`❌ No existe el schema: ${SCHEMA_PATH}`);
    return 2;
  }

  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const expected = parseExpectedColumns(schema);
  const expectedMigrations = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

  console.log(`🔎 Pre-deploy check contra: ${maskedHost(TARGET_URL)}`);
  console.log(`   schema: ${SCHEMA_PATH.replace(ROOT, ".")}\n`);

  const client = new pg.Client({ connectionString: TARGET_URL });
  await client.connect();

  const problems: string[] = [];
  try {
    // (a) MIGRACIONES ---------------------------------------------------------
    let applied: Set<string>;
    try {
      const r = await client.query(
        `SELECT migration_name FROM _prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      applied = new Set(r.rows.map((x) => x.migration_name));
    } catch {
      applied = new Set();
      if (expectedMigrations.length > 0) {
        problems.push(
          "MIGRACIONES: la tabla _prisma_migrations no existe en la base destino → ninguna " +
            "migración figura aplicada. ¿Base vacía o URL equivocada?",
        );
      }
    }
    const pending = expectedMigrations.filter((m) => !applied.has(m));
    if (pending.length > 0) {
      problems.push(
        `MIGRACIONES sin aplicar (${pending.length}):\n` +
          pending.map((m) => `   - ${m}`).join("\n") +
          "\n   → aplicá con `prisma migrate deploy` (Gate 2, con OK) ANTES de deployar.",
      );
    }

    // (b) COLUMNAS ------------------------------------------------------------
    const colRes = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'`,
    );
    const actual = new Map<string, Set<string>>();
    for (const { table_name, column_name } of colRes.rows) {
      if (!actual.has(table_name)) actual.set(table_name, new Set());
      actual.get(table_name)!.add(column_name);
    }

    const missingTables: string[] = [];
    const missingCols: string[] = [];
    for (const [table, cols] of expected) {
      const actualCols = actual.get(table);
      if (!actualCols) {
        missingTables.push(table);
        continue;
      }
      const miss = [...cols].filter((c) => !actualCols.has(c));
      if (miss.length > 0) missingCols.push(`   - ${table}: ${miss.join(", ")}`);
    }
    if (missingTables.length > 0) {
      problems.push(
        `TABLAS que el código espera y NO existen en la base (${missingTables.length}):\n` +
          missingTables.map((t) => `   - ${t}`).join("\n"),
      );
    }
    if (missingCols.length > 0) {
      problems.push(
        "COLUMNAS que el código espera y NO existen en la base:\n" + missingCols.join("\n"),
      );
    }
  } finally {
    await client.end();
  }

  if (problems.length === 0) {
    console.log(
      `✅ Base al día: ${expected.size} tablas del schema y ${expectedMigrations.length} migraciones ` +
        "verificadas. Deploy seguro respecto del schema.",
    );
    return 0;
  }

  console.error("❌ DRIFT detectado — NO deployar hasta resolverlo:\n");
  for (const p of problems) console.error(p + "\n");
  console.error(
    "El código espera una base que todavía no está al día. Desplegar así rompería el cliente en " +
      "vivo (consultas a columnas/tablas inexistentes). Aplicá lo pendiente primero.",
  );
  return 1;
}

// Auto-run solo si se invoca directo (npm run predeploy-check), no al importarlo (tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  check()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error("❌ Error inesperado en el pre-deploy check:", (e as Error).message);
      process.exit(2);
    });
}
