// El motor del club (~2.900 líneas, con un contador de ids a nivel de módulo) baja SÓLO en /admin/club y sólo en el
// navegador. Este test recorre el código y lo afirma: nadie fuera de la pantalla del club (y de su propia carpeta)
// importa el motor, la pantalla lo pide únicamente detrás de `next/dynamic` con `ssr: false`, y la página del
// servidor no arrastra nada que lo importe. (La verificación final es el build: el texto del motor tiene que
// aparecer en un único chunk, el de esta ruta.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const RAIZ = join(process.cwd(), "src");
const CLUB = join(RAIZ, "app", "admin", "(dashboard)", "club");
// La copia del ERP (src/lib/club/motor.mjs), por el alias o por ruta relativa. La del piloto (public/previews) es otra.
const MOTOR = /from\s+["'](?:@\/lib\/club\/motor\.mjs|[^"']*lib\/club\/motor\.mjs)["']/;

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : archivos(p);
    return /\.(ts|tsx|mts|mjs)$/.test(e.name) ? [p] : [];
  });
}

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("sólo la pantalla del club (y la carpeta del motor) importan el motor", () => {
  const fuera = archivos(RAIZ)
    .filter((p) => !p.startsWith(CLUB + sep) && !p.startsWith(join(RAIZ, "lib", "club") + sep))
    .filter((p) => MOTOR.test(sinComentarios(readFileSync(p, "utf8"))))
    .map((p) => relative(process.cwd(), p));
  assert.deepEqual(fuera, []);
});

test("la pantalla pide la demo sólo con next/dynamic y ssr: false; la página del servidor no toca el motor", () => {
  const cargador = sinComentarios(readFileSync(join(CLUB, "ClubCargador.tsx"), "utf8"));
  assert.match(cargador, /^"use client";/, "ssr: false sólo se puede pedir desde un client component");
  assert.match(cargador, /dynamic\(\s*\(\)\s*=>\s*import\("\.\/ClubDemo"\)\s*,\s*\{\s*ssr:\s*false/);
  assert.doesNotMatch(cargador, MOTOR);
  assert.doesNotMatch(cargador, /from\s+["']\.\/(ClubDemo|AgendaCanchas|CuentaDelTurno|almacen|agenda-core|cuenta-core)["']/);

  const pagina = sinComentarios(readFileSync(join(CLUB, "page.tsx"), "utf8"));
  const locales = [...pagina.matchAll(/from\s+["']\.\/([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual(locales, ["ClubCargador"], "la página sólo importa el cargador");
  assert.doesNotMatch(pagina, MOTOR);

  // Nadie más importa ClubDemo de forma estática (si no, el motor viajaría en otro chunk).
  // (Los tests no cuentan: no son parte de ningún chunk; el arnés del navegador la monta a propósito.)
  const estaticos = archivos(RAIZ).filter((p) => !/\.test\.ts$/.test(p)).filter((p) => /from\s+["'][^"']*club\/ClubDemo["']|from\s+["']\.\/ClubDemo["']/.test(sinComentarios(readFileSync(p, "utf8"))));
  assert.deepEqual(estaticos.map((p) => relative(process.cwd(), p)), []);
});
