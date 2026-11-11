// FACTOQUE · La marca visible es «Factoque» (Plan de salida 11/2026 §3). Falla si «Facturita»
// aparece en un texto que la persona puede ver: un string literal o un texto JSX de la app
// (`src/app/facturita/**`), o en los mensajes y el manifest de `src/lib`. Los comentarios y los
// identificadores (`sesionFacturita`, `FacturitaLayout`…) no cuentan: `facturita` es el id técnico.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { MARCA } from "./piel";
import { manifestFacturita } from "@/lib/facturita-pwa";

const RAIZ = join(process.cwd(), "src");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Saca comentarios de bloque y de línea (sin tocar `//` dentro de strings como «https://»). */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/** Los textos visibles posibles: string literals y texto JSX entre `>` y `<`. */
function textos(src: string): string[] {
  const limpio = sinComentarios(src);
  const literales = limpio.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? [];
  const jsx = limpio.match(/>[^<>{}]+</g) ?? [];
  return [...literales, ...jsx];
}

function conFacturita(archivo: string): string[] {
  return textos(readFileSync(archivo, "utf8")).filter((t) => /\bFactur(?:ita|ITA)\b/.test(t));
}

test("la constante de marca es Factoque", () => {
  assert.equal(MARCA, "Factoque");
});

test("ningún texto visible de la app dice «Facturita»", () => {
  const encontrados = [
    ...archivos(join(RAIZ, "app", "facturita")),
    join(RAIZ, "lib", "facturita-core.ts"),
    join(RAIZ, "lib", "facturita-actions.ts"),
    join(RAIZ, "lib", "facturita-pwa.ts"),
    join(RAIZ, "lib", "facturita-sesion.server.ts"),
  ].flatMap((a) => conFacturita(a).map((t) => `${relative(RAIZ, a)}: ${t.slice(0, 80)}`));
  assert.deepEqual(encontrados, [], "usá MARCA («Factoque»); `facturita` queda sólo como id técnico");
});

test("fuera de la app, los textos visibles del producto (consola, blueprint, interruptores) dicen «Factoque»", () => {
  const encontrados = [
    join(RAIZ, "app", "operador", "(console)", "tenants", "[id]", "AppsDelNegocioCard.tsx"),
    join(RAIZ, "blueprints", "facturita.ts"),
    join(RAIZ, "lib", "flags", "facturacion.ts"),
  ].flatMap((a) => conFacturita(a).map((t) => `${relative(RAIZ, a)}: ${t.slice(0, 80)}`));
  assert.deepEqual(encontrados, [], "«Facturita»/«FacturITA» es el nombre viejo: el visible es «Factoque»");
});

test("el detector sí ve un «Facturita» en un string o en JSX, y no en comentarios ni identificadores", () => {
  const src = `// Facturita en comentario\nconst a = sesionFacturita();\nconst b = "Instalá Facturita";\nconst c = <p>Hola Facturita</p>;`;
  assert.deepEqual(textos(src).filter((t) => /\bFacturita\b/.test(t)), ['"Instalá Facturita"', ">Hola Facturita<"]);
});

test("el manifest lleva la marca y conserva el id técnico de las rutas", () => {
  const m = manifestFacturita();
  assert.equal(m.short_name, MARCA);
  assert.match(m.name, /^Factoque/);
  assert.equal(m.scope, "/facturita/");
  assert.match(m.start_url, /^\/facturita\//);
});
