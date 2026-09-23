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
//   (c) ÍNDICES: los `@@unique`/`@@index` de schema.prisma vs pg_index, comparados por
//       COLUMNAS (no por nombre). Un `@@unique` ausente es BLOQUEANTE: cuatro de ellos son
//       el árbitro de base de la idempotencia del dinero, y `migrate deploy` se detiene en
//       la primera migración que falla — puede dejar la columna creada y el índice no.
//   (Columnas e índices de MÁS en la base no fallan: la base puede ir adelante del código.)
//
// Base destino (en orden de preferencia):
//   PREDEPLOY_DATABASE_URL  › DATABASE_URL (.env)
// Es seguro apuntarlo a prod: solo corre SELECTs sobre information_schema y
// _prisma_migrations. Overrides para test: PREDEPLOY_SCHEMA_PATH, PREDEPLOY_MIGRATIONS_DIR.
//
// Exit 0 = base al día (deploy seguro). Exit 1 = drift (NO deployar).
// Exit 2 = no se pudo mirar: no conecta, no hay permiso, o error de uso. NO es "está bien".
//
// MODO LOTE (PREDEPLOY_LOTE=prisma/lote-deploy.txt). Lo usa el build de Vercel ANTES de
// migrar: la base está atrasada a propósito, así que no compara columnas; compara QUÉ se va
// a aplicar contra lo que el dueño declaró en el archivo. "Aplicar exactamente estas cinco"
// deja de ser una frase del runbook y pasa a ser un freno: una sexta migración que se coló
// en la rama, o una migración en la base que el repo no conoce, detienen el build.
//
// NUNCA SE PASA `statement_timeout` AL CLIENTE. node-pg lo manda como parámetro de ARRANQUE
// y el pooler de Neon (PgBouncer) rechaza la conexión entera: el chequeo fallaría en todos
// los deploys de producción. El techo de tiempo es el reloj de 90 s del final del archivo.
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

// ── Parseo de schema.prisma → índices únicos y comunes esperados ─────────────
//
// POR QUÉ EXISTE ESTE PARSER, que es la parte que faltaba del chequeo.
//
// Hasta acá el script comparaba migraciones y columnas, y salteaba explícitamente las
// líneas `@@` (ver `parseExpectedColumns`). O sea: verificaba que la COLUMNA estuviera y
// no que el ÍNDICE existiera. Para un índice de rendimiento eso sería una molestia; para
// un `@@unique` es otra cosa.
//
// En este sistema, cuatro `@@unique` son el ÁRBITRO DE BASE de la idempotencia del dinero:
// son la "capa 2" que hace chocar el segundo `create` cuando dos submits pasan el
// pre-chequeo a la vez (ver el comentario de `src/lib/caja/cobro-turno.ts`). Sin el índice,
// el pre-chequeo solo no alcanza —es un check-then-write— y se cobra dos veces.
//
// Y `prisma migrate deploy` se detiene en la primera migración que falla. Una que aplique
// su `ADD COLUMN` y muera antes del `CREATE UNIQUE INDEX` deja la base en un estado donde
// la columna existe, el chequeo de columnas da verde, y el código cree que tiene árbitro.
// Ése es exactamente el estado que este bloque atrapa.
function parseExpectedIndexes(schema: string): { tabla: string; cols: string[]; unico: boolean }[] {
  const out: { tabla: string; cols: string[]; unico: boolean }[] = [];
  for (const [, model, body] of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      const m = /^@@(unique|index)\s*\(\s*\[([^\]]+)\]/.exec(line);
      if (!m) continue;
      const cols = m[2].split(",").map((c) => c.trim().replace(/\(.*\)$/, "")).filter(Boolean);
      if (cols.length > 0) out.push({ tabla: model, cols, unico: m[1] === "unique" });
    }
  }
  return out;
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

/** Postgres: "permission denied". El rol conecta pero no puede leer esa tabla. */
const SIN_PERMISO = "42501";
/** Postgres: "undefined_table". */
const NO_EXISTE_TABLA = "42P01";

/** Nombres de migración declarados en el archivo del lote (una por línea, `#` comenta). */
function leerLote(ruta: string): string[] {
  return readFileSync(ruta, "utf8")
    .split("\n")
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .sort();
}

/** Corre el chequeo y devuelve el exit code (0=al día, 1=drift, 2=no se pudo mirar). */
export async function check(): Promise<number> {
  // Env leído acá (no al importar) para ser testeable con distintos targets.
  const SCHEMA_PATH = process.env.PREDEPLOY_SCHEMA_PATH ?? join(ROOT, "prisma", "schema.prisma");
  const MIGRATIONS_DIR = process.env.PREDEPLOY_MIGRATIONS_DIR ?? join(ROOT, "prisma", "migrations");
  const TARGET_URL = process.env.PREDEPLOY_DATABASE_URL ?? process.env.DATABASE_URL;
  const LOTE = process.env.PREDEPLOY_LOTE;

  if (!TARGET_URL) {
    console.error("❌ Falta la base destino. Seteá PREDEPLOY_DATABASE_URL o DATABASE_URL (.env).");
    return 2;
  }
  if (LOTE && !existsSync(LOTE)) {
    console.error(`❌ No existe el archivo del lote: ${LOTE}`);
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

  // Sólo el tiempo de CONEXIÓN. Ver la cabecera: `statement_timeout` acá rompe el pooler.
  const client = new pg.Client({ connectionString: TARGET_URL, connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
  } catch (e) {
    console.error(`❌ No se pudo CONECTAR a ${maskedHost(TARGET_URL)}: ${(e as Error).message}`);
    return 2;
  }

  // Con qué rol se está mirando. Importa: `information_schema` sólo muestra las columnas que
  // ESTE rol puede ver, así que un rol sin GRANT ve tablas "faltantes" que sí existen.
  const quien = await client.query(
    `SELECT current_user::text AS rol, r.rolbypassrls AS bypass
       FROM pg_roles r WHERE r.rolname = current_user`,
  );
  const { rol, bypass } = quien.rows[0] ?? { rol: "(desconocido)", bypass: null };
  console.log(`   rol: ${rol}${bypass ? "  (BYPASSRLS — no respeta el aislamiento)" : ""}\n`);

  const problems: string[] = [];
  let migracionesMiradas = true;
  try {
    // (a) MIGRACIONES ---------------------------------------------------------
    let applied: Set<string> | null;
    try {
      const r = await client.query(
        `SELECT migration_name FROM _prisma_migrations
         WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      applied = new Set(r.rows.map((x) => x.migration_name));
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === SIN_PERMISO) {
        // El rol de la APP no tiene por qué leer la tabla de Prisma: no es drift, es que no
        // se puede mirar desde acá. Las columnas y los índices se siguen verificando.
        if (LOTE) {
          console.error(`❌ El rol ${rol} no puede leer _prisma_migrations: no se puede validar el lote.`);
          return 2;
        }
        console.warn(`⚠ El rol ${rol} no puede leer _prisma_migrations: se saltea (a) y se sigue.\n`);
        applied = null;
        migracionesMiradas = false;
      } else if (code === NO_EXISTE_TABLA) {
        applied = new Set();
        if (expectedMigrations.length > 0) {
          problems.push(
            "MIGRACIONES: la tabla _prisma_migrations no existe en la base destino → ninguna " +
              "migración figura aplicada. ¿Base vacía o URL equivocada?",
          );
        }
      } else {
        throw e;
      }
    }

    if (LOTE && applied) {
      // MODO LOTE: sólo migraciones. La base está atrasada a propósito.
      const declarado = leerLote(LOTE);
      const pendientes = expectedMigrations.filter((m) => !applied.has(m));
      const repo = new Set(expectedMigrations);
      const desconocidas = [...applied].filter((m) => !repo.has(m)).sort();
      const iguales =
        pendientes.length === declarado.length && pendientes.every((m, i) => m === declarado[i]);
      if (desconocidas.length > 0) {
        problems.push(
          `MIGRACIONES en la base que este repo NO tiene (${desconocidas.length}):\n` +
            desconocidas.map((m) => `   - ${m}`).join("\n") +
            "\n   → la base vino de otra rama. No se migra encima de algo que no se conoce.",
        );
      }
      if (pendientes.length > 0 && !iguales) {
        const sobran = pendientes.filter((m) => !declarado.includes(m));
        const faltan = declarado.filter((m) => !pendientes.includes(m));
        problems.push(
          `LOTE: lo que se va a aplicar NO es lo declarado en ${LOTE}.\n` +
            (sobran.length ? `   Pendientes que NO están declaradas:\n${sobran.map((m) => `   - ${m}`).join("\n")}\n` : "") +
            (faltan.length ? `   Declaradas que NO están pendientes:\n${faltan.map((m) => `   - ${m}`).join("\n")}\n` : "") +
            "   → no se migra producción con un lote distinto del que se revisó.",
        );
      }
      if (problems.length === 0) {
        console.log(
          pendientes.length === 0
            ? "✅ Lote: nada pendiente. La base ya tiene todas las migraciones del repo."
            : `✅ Lote: las ${pendientes.length} pendientes son exactamente las declaradas.`,
        );
        return 0;
      }
      console.error("❌ LOTE RECHAZADO — no se migra:\n");
      for (const p of problems) console.error(p + "\n");
      return 1;
    }

    const pending = applied ? expectedMigrations.filter((m) => !applied.has(m)) : [];
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
        `TABLAS que el código espera y NO existen en la base, o este rol no tiene GRANT sobre ` +
          `ellas (${missingTables.length}):\n` +
          missingTables.map((t) => `   - ${t}`).join("\n"),
      );
    }
    if (missingCols.length > 0) {
      problems.push(
        "COLUMNAS que el código espera y NO existen en la base:\n" + missingCols.join("\n"),
      );
    }
    // (c) ÍNDICES ------------------------------------------------------------
    //
    // Se comparan por COLUMNAS, no por nombre: el nombre que le pone Prisma
    // (`Tabla_col1_col2_key`) es una convención, y un índice creado a mano con otro nombre
    // cumple igual. Lo que importa es que exista un índice sobre ese conjunto de columnas,
    // y que sea ÚNICO si el schema lo declara único.
    const idxRes = await client.query(
      `SELECT t.relname::text AS tabla, i.relname::text AS indice, ix.indisunique AS unico,
              array_agg(a.attname::text ORDER BY k.ord) AS cols
         FROM pg_class t
         JOIN pg_index ix       ON ix.indrelid = t.oid
         JOIN pg_class i        ON i.oid = ix.indexrelid
         JOIN pg_namespace n    ON n.oid = t.relnamespace
         JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
         JOIN pg_attribute a    ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE n.nspname = 'public' AND t.relkind = 'r'
        GROUP BY t.relname, i.relname, ix.indisunique`,
    );
    const enLaBase = idxRes.rows.map((r) => ({
      tabla: r.tabla as string,
      firma: (r.cols as string[]).join(","),
      unico: r.unico as boolean,
    }));
    const faltanUnicos: string[] = [];
    const faltanIndices: string[] = [];
    for (const esperado of parseExpectedIndexes(schema)) {
      // Si la tabla entera falta, ya se reportó arriba: no se duplica el ruido.
      if (!actual.has(esperado.tabla)) continue;
      const firma = esperado.cols.join(",");
      const hay = enLaBase.some(
        (i) => i.tabla === esperado.tabla && i.firma === firma && (!esperado.unico || i.unico),
      );
      if (hay) continue;
      const linea = `   - ${esperado.tabla}(${esperado.cols.join(", ")})`;
      if (esperado.unico) faltanUnicos.push(linea);
      else faltanIndices.push(linea);
    }
    if (faltanUnicos.length > 0) {
      problems.push(
        `ÍNDICES ÚNICOS que el código espera y NO existen en la base (${faltanUnicos.length}):\n` +
          faltanUnicos.join("\n") +
          "\n   → un @@unique ausente NO es cosmético: varios arbitran la idempotencia del " +
          "dinero (la 'capa 2' de cobro-turno.ts). Sin él, dos submits simultáneos cobran dos " +
          "veces. NO deployar.",
      );
    }
    if (faltanIndices.length > 0) {
      problems.push(
        `ÍNDICES que el código espera y NO existen en la base (${faltanIndices.length}):\n` +
          faltanIndices.join("\n") +
          "\n   → no rompe, pero la consulta que los supone va a escanear la tabla.",
      );
    }
  } finally {
    await client.end();
  }

  if (problems.length === 0) {
    console.log(
      `✅ Base al día: ${expected.size} tablas, ${parseExpectedIndexes(schema).length} índices y ` +
        (migracionesMiradas
          ? `${expectedMigrations.length} migraciones verificadas.`
          : "migraciones NO verificadas (este rol no lee _prisma_migrations).") +
        " Deploy seguro respecto del schema.",
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
  // Techo duro: un build de Vercel colgado de una consulta es peor que uno que falla.
  setTimeout(() => {
    console.error("❌ El pre-deploy check superó los 90 s. Se corta: no se pudo mirar la base.");
    process.exit(2);
  }, 90_000).unref();
  check()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error("❌ Error inesperado en el pre-deploy check:", (e as Error).message);
      process.exit(2);
    });
}
