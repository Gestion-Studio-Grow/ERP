// ============================================================================
// Los frenos del build de Vercel (scripts/vercel-build.mjs).
// ============================================================================
//
// Es el único camino por el que la base de PRODUCCIÓN se migra sola, así que sus candados se
// prueban ejecutándolos, no leyéndolos.
//
// VIVE ACÁ Y NO AL LADO DEL SCRIPT porque `npm test` corre `src/**/*.test.ts`: un test en
// `scripts/` no lo corre nadie, y un test que nadie corre es peor que no tenerlo — da la
// sensación de cobertura sin darla.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, chmodSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = "scripts/vercel-build.mjs";
const fuente = readFileSync(new URL(`../../${SCRIPT}`, import.meta.url), "utf8");

// Un `npx` de mentira adelante en el PATH: anota cada llamada y NO compila ni migra nada.
// `tsx` sí lo delega al de verdad, para que el pre-deploy check corra en serio (y falle en
// serio contra un host que no existe). Así los frenos se prueban EJECUTÁNDOLOS.
const STUB_DIR = mkdtempSync(join(tmpdir(), "vercel-build-"));
const LLAMADAS = join(STUB_DIR, "llamadas.log");
const TSX_REAL = resolve("node_modules/.bin/tsx");
writeFileSync(
  join(STUB_DIR, "npx"),
  `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(LLAMADAS)}, args.join(" ") + "\\n");
if (args[0] === "tsx") {
  const r = spawnSync(${JSON.stringify(TSX_REAL)}, args.slice(1), { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
process.exit(0);
`,
);
chmodSync(join(STUB_DIR, "npx"), 0o755);

/** Env limpio de toda cadena real: ningún test puede tocar una base por herencia. */
function corre(env: Record<string, string>) {
  writeFileSync(LLAMADAS, "");
  const base = { ...process.env };
  for (const k of ["DATABASE_URL", "MIGRATE_DATABASE_URL", "PREDEPLOY_DATABASE_URL", "AUTH_SECRET", "VERCEL_ENV"]) {
    delete base[k];
  }
  const r = spawnSync("node", [SCRIPT], {
    env: { ...base, PATH: `${STUB_DIR}:${process.env.PATH}`, DOTENV_CONFIG_PATH: "/dev/null", ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  const llamadas = existsSync(LLAMADAS) ? readFileSync(LLAMADAS, "utf8").trim().split("\n").filter(Boolean) : [];
  return { ...r, salida: `${r.stdout}${r.stderr}`, llamadas };
}

const HOST_MUERTO = "postgresql://u:p@127.0.0.1:1/nada";

test("una cadena del POOLER frena el build antes de tocar nada", () => {
  // El pooler rechaza las migraciones y el error que devuelve no dice "usaste el pooler".
  // Sin este freno, el deploy muere con un mensaje que manda a investigar al lugar equivocado.
  const r = corre({
    VERCEL_ENV: "production",
    AUTH_SECRET: "x",
    MIGRATE_DATABASE_URL: "postgresql://u:p@ep-algo-pooler.sa-east-1.aws.neon.tech/neondb",
  });
  assert.equal(r.status, 1, "el build tiene que fallar, no seguir");
  const salida = r.salida;
  assert.match(salida, /POOLER/, "y tiene que decir POR QUÉ falló");
  assert.match(salida, /Connection pooling/, "y cómo se arregla, con el nombre del control real");
  assert.doesNotMatch(salida, /migrate deploy/, "nunca tuvo que llegar a migrar");
});

test("un preview NO migra, aunque tenga la cadena de producción", () => {
  // Es la peor trampa posible de este repo: un preview que migre la base del cliente.
  const decision = fuente.slice(fuente.indexOf("const entorno"), fuente.indexOf("if (!migraEsteBuild)"));
  assert.match(decision, /VERCEL_ENV/, "la decisión mira el entorno");
  assert.match(
    decision,
    /esProduccion\s*&&\s*urlMigracion\s*!==\s*""/,
    "las DOS condiciones van juntas: producción Y una cadena de migración explícita. " +
      "Con un OR, o sin el chequeo de entorno, un preview migraría producción.",
  );
});

test("sin MIGRATE_DATABASE_URL no se toca ninguna base", () => {
  assert.match(
    fuente,
    /const urlMigracion = \(process\.env\.MIGRATE_DATABASE_URL \?\? ""\)\.trim\(\)/,
    "la variable se lee y se limpia: una cadena de espacios no puede pasar por seteada",
  );
});

test("el orden es: validar el lote, migrar, verificar los árbitros, y RECIÉN compilar", () => {
  // Publicar el código antes de migrar deja el mostrador sin poder cobrar: el código nuevo
  // busca columnas que todavía no existen. Y verificar DESPUÉS de compilar no sirve de nada,
  // porque para entonces el build ya salió bien. Se miden los PASOS, no el helper.
  const lote = fuente.indexOf('titulo("1b"');
  const migra = fuente.indexOf('"migrate", "deploy"');
  const verifica = fuente.indexOf("titulo(3,");
  const compila = fuente.lastIndexOf('"next", "build"');
  assert.ok(lote > 0 && migra > 0 && verifica > 0 && compila > 0, "los pasos tienen que existir");
  assert.ok(lote < migra, "el lote se valida ANTES de tocar la base");
  assert.ok(migra < verifica, "primero migrar, después verificar");
  assert.ok(verifica < compila, "verificar ANTES de compilar: si falla, no se publica nada");
});

test("que falte un árbitro del dinero FRENA el build", () => {
  // Sin el índice único, el cobro queda con una sola capa (check-then-write) y dos pestañas
  // cobran dos veces. El runbook es explícito: si falta un índice, NO deployar.
  const bloque = fuente.slice(fuente.indexOf("titulo(3,"));
  const hastaElProximoPaso = bloque.slice(0, bloque.indexOf("titulo(4"));
  assert.match(hastaElProximoPaso, /fatal\(/, "el chequeo de índices tiene que ser un freno duro");
  assert.match(hastaElProximoPaso, /noConecta\(/, "y no poder mirar TAMBIÉN frena: 2 no es 0");
});

test("producción sin AUTH_SECRET no se publica", () => {
  const r = corre({ VERCEL_ENV: "production", DATABASE_URL: HOST_MUERTO });
  assert.equal(r.status, 1);
  assert.match(r.salida, /AUTH_SECRET/);
  assert.deepEqual(r.llamadas, [], "frena antes de ejecutar nada");
});

test("producción sin ninguna cadena de base no se publica", () => {
  const r = corre({ VERCEL_ENV: "production", AUTH_SECRET: "x" });
  assert.equal(r.status, 1);
  assert.match(r.salida, /ni MIGRATE_DATABASE_URL ni DATABASE_URL/);
  assert.ok(!r.llamadas.some((l) => l.startsWith("next")), "y no compila");
});

test("producción SIN migrar igual mira la base, y si no puede, NO publica", () => {
  // El agujero que esto cierra: un merge antes de cargar MIGRATE_DATABASE_URL publicaba
  // código nuevo contra la base vieja, con el build en verde.
  const r = corre({ VERCEL_ENV: "production", AUTH_SECRET: "x", DATABASE_URL: HOST_MUERTO });
  assert.equal(r.status, 1);
  assert.match(r.salida, /no se pudo CONECTAR/i);
  assert.ok(r.llamadas.some((l) => l.includes("predeploy-check.mts")), "corrió el chequeo");
  assert.ok(!r.llamadas.some((l) => l.startsWith("next")), "y no compiló");
});

test("con migración, un host inalcanzable frena ANTES de migrar", () => {
  const r = corre({ VERCEL_ENV: "production", AUTH_SECRET: "x", MIGRATE_DATABASE_URL: HOST_MUERTO });
  assert.equal(r.status, 1);
  assert.match(r.salida, /no se pudo CONECTAR/i);
  assert.ok(!r.llamadas.some((l) => l.includes("migrate deploy")), "nunca llegó a migrar");
});

test("un preview compila sin mirar ninguna base", () => {
  const r = corre({ VERCEL_ENV: "preview", DATABASE_URL: HOST_MUERTO, MIGRATE_DATABASE_URL: HOST_MUERTO });
  assert.equal(r.status, 0);
  assert.deepEqual(r.llamadas, ["prisma generate", "next build"]);
});

test("el mensaje de migración dice NO CANCELAR, no 'cancelá'", () => {
  // Cancelar a mitad de `migrate deploy` es lo que deja la base trabada con P3009.
  assert.match(fuente, /NO CANCELES ESTE BUILD/);
  assert.doesNotMatch(fuente, /cancelá el deploy/i);
});

test("el chequeo nunca manda statement_timeout al pooler", () => {
  // node-pg lo manda como parámetro de ARRANQUE y PgBouncer rechaza la conexión entera:
  // fallaría todo deploy de producción. Sólo se permite el timeout de conexión.
  const check = readFileSync(new URL("../../scripts/predeploy-check.mts", import.meta.url), "utf8");
  const cliente = check.slice(check.indexOf("new pg.Client("), check.indexOf("new pg.Client(") + 200);
  assert.doesNotMatch(cliente, /statement_timeout|query_timeout|options:/);
  assert.match(cliente, /connectionTimeoutMillis/);
});

// ── Con base de verdad (opcional) ────────────────────────────────────────────
// PREDEPLOY_TEST_DATABASE_URL = una base local con TODAS las migraciones del repo aplicadas.
const BASE = process.env.PREDEPLOY_TEST_DATABASE_URL;

function check(env: Record<string, string>) {
  return spawnSync(TSX_REAL, ["scripts/predeploy-check.mts"], {
    env: { ...process.env, DOTENV_CONFIG_PATH: "/dev/null", ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
}

test("lote: una migración de más en la rama frena", { skip: !BASE && "sin PREDEPLOY_TEST_DATABASE_URL" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "migs-"));
  const orig = resolve("prisma/migrations");
  const nombres = readdirSync(orig).filter((n) => /^\d/.test(n));
  for (const n of [...nombres, "20991231000000_sexta"]) mkdirSync(join(dir, n));
  const lote = join(dir, "lote.txt");
  writeFileSync(lote, "");
  const r = check({ PREDEPLOY_DATABASE_URL: BASE!, PREDEPLOY_LOTE: lote, PREDEPLOY_MIGRATIONS_DIR: dir });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /20991231000000_sexta/);
});

test("lote: base al día → nada pendiente → sigue", { skip: !BASE && "sin PREDEPLOY_TEST_DATABASE_URL" }, () => {
  const r = check({ PREDEPLOY_DATABASE_URL: BASE!, PREDEPLOY_LOTE: "prisma/lote-deploy.txt" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("el build no hace el respaldo, y lo dice", () => {
  // Ningún automatismo puede decidir por el dueño que un respaldo no hace falta.
  assert.match(fuente, /No hace el backup/i, "y lo dice donde se lee");
  // Que NO lo EJECUTE. Nombrarlo en un comentario es justamente lo que se quiere: ahí se le
  // dice a la persona qué tiene que hacer ella.
  const ejecutables = [...fuente.matchAll(/corre\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(ejecutables)].sort(),
    ["node", "npx"],
    "el build sólo ejecuta node y npx: nada de pg_dump, psql ni llamadas a la API de Neon",
  );
});

test("el build no prende RLS solo: mide y avisa", () => {
  // Prender RLS es una decisión de seguridad del dueño (Gate 2), no un efecto colateral.
  const bloque = fuente.slice(fuente.indexOf("check-rls-live.mjs"));
  const hastaCompilar = bloque.slice(0, bloque.indexOf("titulo(5"));
  assert.doesNotMatch(hastaCompilar, /fatal\(/, "el drift de RLS avisa, no frena");
  assert.match(hastaCompilar, /⚠/, "pero avisa fuerte");
  assert.doesNotMatch(fuente, /0001_enable_rls\.sql"\]/, "y nunca lo aplica por su cuenta");
});

test("vercel.json usa este script como build", () => {
  const v = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
  assert.equal(v.buildCommand, "node scripts/vercel-build.mjs");
});
