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
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SCRIPT = "scripts/vercel-build.mjs";
const fuente = readFileSync(new URL(`../../${SCRIPT}`, import.meta.url), "utf8");

function corre(env: Record<string, string>) {
  return spawnSync("node", [SCRIPT], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
}

test("una cadena del POOLER frena el build antes de tocar nada", () => {
  // El pooler rechaza las migraciones y el error que devuelve no dice "usaste el pooler".
  // Sin este freno, el deploy muere con un mensaje que manda a investigar al lugar equivocado.
  const r = corre({
    VERCEL_ENV: "production",
    MIGRATE_DATABASE_URL: "postgresql://u:p@ep-algo-pooler.sa-east-1.aws.neon.tech/neondb",
  });
  assert.equal(r.status, 1, "el build tiene que fallar, no seguir");
  const salida = `${r.stdout}${r.stderr}`;
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

test("el orden es migrar, verificar los árbitros, y RECIÉN compilar", () => {
  // Publicar el código antes de migrar deja el mostrador sin poder cobrar: el código nuevo
  // busca columnas que todavía no existen. Y verificar DESPUÉS de compilar no sirve de nada,
  // porque para entonces el build ya salió bien.
  const migra = fuente.indexOf('"migrate", "deploy"');
  const verifica = fuente.indexOf("predeploy-check.mts");
  // El ÚLTIMO `next build`: el primero es el de la salida temprana (el build que no migra),
  // que por definición va antes de todo y no dice nada sobre este orden.
  const compila = fuente.lastIndexOf('"next", "build"');
  assert.ok(migra > 0 && verifica > 0 && compila > 0, "los tres pasos tienen que existir");
  assert.ok(migra < verifica, "primero migrar, después verificar");
  assert.ok(verifica < compila, "verificar ANTES de compilar: si falla, no se publica nada");
});

test("que falte un árbitro del dinero FRENA el build", () => {
  // Sin el índice único, el cobro queda con una sola capa (check-then-write) y dos pestañas
  // cobran dos veces. El runbook es explícito: si falta un índice, NO deployar.
  const bloque = fuente.slice(fuente.indexOf("predeploy-check.mts"));
  const hastaElProximoPaso = bloque.slice(0, bloque.indexOf("titulo(4"));
  assert.match(hastaElProximoPaso, /fatal\(/, "el chequeo de índices tiene que ser un freno duro");
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
