// ============================================================================
// TANDA 4 — la migración y el puente de schema-ahead, sin base (M-113, M-114 y la regla 1 de
// src/lib/padel/modelo.ts). Lo mismo contra Postgres está en `motor-t4-postgres.test.ts`.
// ============================================================================
//
//   node --import tsx --test src/lib/padel/modelo-t4.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { COLUMNAS_T4, MIGRACION_T4, OMITIR_COLUMNAS_T4, SIN_ACTUALIZACION, SONDA_T4, TABLAS_T4, faltaModeloT4 } from "./modelo";
import { padelClasesModule } from "@/modules/descriptors/padel-clases";

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const SQL = leer(`prisma/migrations/${MIGRACION_T4}/migration.sql`);

test("M-113: check-coverage pasa con las tablas nuevas, y cada tabla nueva prende RLS con tenant_isolation en la misma migración", () => {
  const salida = execFileSync(process.execPath, [path.join(RAIZ, "prisma/rls/check-coverage.mjs")], { encoding: "utf8" });
  assert.match(salida, /✅/);
  for (const t of TABLAS_T4) assert.match(salida, new RegExp(`\\b${t}\\b`), `${t} entre los modelos protegidos`);
  // El mismo bloque que 20261015120000_modulo_padel_clases (DO $$ … FOREACH … tenant_isolation).
  const bloque = /DO \$\$[\s\S]*?FOREACH t IN ARRAY ARRAY\[([\s\S]*?)\][\s\S]*?ENABLE ROW LEVEL SECURITY[\s\S]*?CREATE POLICY tenant_isolation ON %I[\s\S]*?current_setting\(''app\.current_tenant_id'', true\)[\s\S]*?\$\$;/.exec(SQL);
  assert.ok(bloque, "falta el bloque RLS");
  const enBloque = [...bloque[1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
  const creadas = [...SQL.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(enBloque, creadas, "toda tabla que crea la migración está en el bloque RLS");
  assert.deepEqual(creadas, [...TABLAS_T4].sort());
});

test("M-114: la migración es aditiva (nada se borra, renombra ni cambia de tipo; toda columna nueva tiene DEFAULT o es NULL) y NO está en lote-deploy.txt", () => {
  const sinComentarios = SQL.replace(/--.*$/gm, "");
  assert.doesNotMatch(sinComentarios, /\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|TYPE)\b/i);
  assert.doesNotMatch(sinComentarios, /\bRENAME\b/i);
  assert.doesNotMatch(sinComentarios, /ALTER\s+COLUMN/i);
  // Sentencias que tocan datos (no el «ON DELETE / ON UPDATE» de las claves foráneas).
  assert.doesNotMatch(sinComentarios, /^\s*(DELETE|TRUNCATE|UPDATE|INSERT)\b/im, "no toca datos");
  // Toda columna agregada a una tabla existente: NULL o con DEFAULT (no rompe filas que ya están).
  for (const m of sinComentarios.matchAll(/ADD COLUMN\s+"(\w+)"\s+([^,;]+)/g)) {
    const def = m[2];
    assert.ok(!/NOT NULL/.test(def) || /DEFAULT/.test(def), `${m[1]}: NOT NULL sin DEFAULT`);
  }
  // DROP POLICY IF EXISTS sólo adentro del bloque RLS (idempotencia de la política, como en 0001).
  const lote = leer("prisma/lote-deploy.txt").split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  assert.equal(lote.includes(MIGRACION_T4), false, "Gate 2: no se agrega al lote sin OK del dueño");
  const ref = padelClasesModule.migraciones?.find((m) => m.carpeta === `prisma/migrations/${MIGRACION_T4}`);
  assert.ok(ref && ref.aditiva === true, "el descriptor la lista como aditiva");
});

test("las columnas nuevas de tablas viejas usan `dbgenerated` en el schema (Prisma 7 manda los @default(valor) en el INSERT)", () => {
  const schema = leer("prisma/schema.prisma");
  const modelo = (nombre: string) => new RegExp(`model ${nombre} \\{([\\s\\S]*?)\\n\\}`).exec(schema)![1];
  const cuerpos: Record<keyof typeof COLUMNAS_T4, string> = { padelConfig: modelo("PadelConfig"), padelDisponibilidad: modelo("PadelDisponibilidad"), padelClase: modelo("PadelClase") };
  for (const [m, cols] of Object.entries(COLUMNAS_T4) as [keyof typeof COLUMNAS_T4, readonly string[]][]) {
    for (const c of cols) {
      const linea = new RegExp(`^\\s*${c}\\s+.*$`, "m").exec(cuerpos[m])?.[0];
      assert.ok(linea, `${m}.${c} está en el schema`);
      assert.doesNotMatch(linea!, /@default\((?!dbgenerated)/, `${m}.${c}: default con valor → Prisma lo mandaría en el INSERT y rompe una base sin la migración`);
    }
  }
  // La sonda pregunta por cada tabla nueva y por columnas de las tres tablas viejas.
  for (const t of TABLAS_T4) assert.ok(SONDA_T4.some(([x]) => x === t));
  for (const t of ["PadelConfig", "PadelDisponibilidad", "PadelClase"]) assert.ok(SONDA_T4.some(([x]) => x === t));
  assert.deepEqual(Object.keys(OMITIR_COLUMNAS_T4.padelClase).sort(), [...COLUMNAS_T4.padelClase].sort());
});

/** Las llamadas de Prisma a un modelo con columnas T4 que NO llevan `select` (lectura o escritura que devuelve la fila). */
function llamadasSinSelect(src: string): string[] {
  const out: string[] = [];
  const re = /\.(padel(?:Clase|Config|Disponibilidad))\.(findFirst|findMany|findUnique|findFirstOrThrow|findUniqueOrThrow|create|update|upsert|delete)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let d = 1;
    while (d > 0 && i < src.length) {
      if (src[i] === "(") d++;
      else if (src[i] === ")") d--;
      i++;
    }
    const args = src.slice(m.index + m[0].length, i - 1);
    if (!/\bselect\s*:/.test(args) || /\binclude\s*:/.test(args)) out.push(`${m[1]}.${m[2]} @${src.slice(0, m.index).split("\n").length}`);
  }
  return out;
}

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return n === "generated" || n === "node_modules" ? [] : archivos(p);
    return /\.(ts|tsx|mts)$/.test(n) && !/\.test\.ts$|\.e2e\./.test(n) ? [p] : [];
  });
}

test("regla 1 del puente: ningún código de la app pide PadelClase / PadelConfig / PadelDisponibilidad sin `select` (andaría roto en una base sin la migración)", () => {
  const malas: string[] = [];
  for (const f of [...archivos(path.join(RAIZ, "src")), path.join(RAIZ, "prisma/seed-padel-matias.ts")]) {
    const src = readFileSync(f, "utf8");
    if (!/padel(Clase|Config|Disponibilidad)/.test(src)) continue;
    for (const x of llamadasSinSelect(src)) malas.push(`${path.relative(RAIZ, f)} ${x}`);
  }
  assert.deepEqual(malas, []);
});

test("faltaModeloT4 reconoce tabla/columna T4 inexistente (Prisma y adaptador crudo) y deja subir lo demás", () => {
  assert.equal(faltaModeloT4({ code: "P2021", message: "The table `public.PadelClub` does not exist in the current database." }), true);
  assert.equal(faltaModeloT4({ code: "P2022", message: "The column `pagado` does not exist", meta: { modelName: "PadelClase" } }), true);
  assert.equal(faltaModeloT4({ name: "DriverAdapterError", cause: { originalCode: "42P01", kind: "TableDoesNotExist", originalMessage: 'relation "PadelSerie" does not exist' } }), true);
  assert.equal(faltaModeloT4({ code: "P2022", message: "The column `cobraEnMostrador` does not exist" }), false, "una columna de otro módulo sube");
  assert.equal(faltaModeloT4({ code: "P2002", message: "PadelClub unique" }), false);
  assert.equal(faltaModeloT4(new Error("connect ECONNREFUSED")), false);
  assert.equal(SIN_ACTUALIZACION, "Esta función se habilita cuando se active la actualización de la base.");
});
