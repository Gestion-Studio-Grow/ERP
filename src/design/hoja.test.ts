// La hoja que se sirve (public/diseno/renglon.css) es la que se mide y la que se promete:
//   · su bloque de tokens es el que sale de tokens.ts + fuentes.ts (lo que mide tokens.test.ts);
//   · su versión (`?v=`) es la de su contenido;
//   · TODO está acotado bajo [data-diseno="renglon"] (sin el atributo no pinta nada: CH);
//   · va SIN capa (le gana a @layer utilities de Tailwind);
//   · materia plana: 0 degradés, 0 `backdrop-filter`, ninguna sombra de dos capas;
//   · entra en el presupuesto: ≤ 30 KB gzip la hoja, ≤ 120 KB la letra (un solo archivo).
// Lo EJECUTA leyendo el archivo real y recorriendo sus reglas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { ALCANCE, PIEL, bloqueDeTokens, MARCA_FIN, MARCA_INICIO, RUTA_HOJA, versionDe } from "./hoja";
import { VERSION_HOJA } from "./hoja-version";
import { LETRA } from "./fuentes";
import { HOJAS_DEL_DISENO, LETRA_DEL_DISENO, PIEL_RENGLON } from "@/lib/diseno/diseno";

const RAIZ = process.cwd();
const css = readFileSync(join(RAIZ, RUTA_HOJA), "utf8");

/** Recorre las reglas: devuelve cada selector de estilo y cada at-rule, con su contexto. */
function reglas(fuente: string): { selectores: string[]; atRules: string[] } {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectores: string[] = [];
  const atRules: string[] = [];
  const recorrer = (texto: string) => {
    let i = 0;
    while (i < texto.length) {
      const abre = texto.indexOf("{", i);
      if (abre < 0) break;
      const preludio = texto.slice(i, abre).trim().replace(/^[^;]*;/, "").trim();
      let nivel = 1;
      let j = abre + 1;
      while (j < texto.length && nivel > 0) {
        if (texto[j] === "{") nivel++;
        else if (texto[j] === "}") nivel--;
        j++;
      }
      const cuerpo = texto.slice(abre + 1, j - 1);
      if (preludio.startsWith("@")) {
        atRules.push(preludio);
        if (/^@(media|supports|starting-style|container)\b/.test(preludio)) recorrer(cuerpo);
      } else {
        selectores.push(preludio);
      }
      i = j;
    }
  };
  recorrer(sinComentarios);
  return { selectores, atRules };
}

function partirSelectores(lista: string): string[] {
  const out: string[] = [];
  let nivel = 0;
  let actual = "";
  for (const ch of lista) {
    if (ch === "(" || ch === "[") nivel++;
    if (ch === ")" || ch === "]") nivel--;
    if (ch === "," && nivel === 0) {
      out.push(actual.trim());
      actual = "";
    } else actual += ch;
  }
  out.push(actual.trim());
  return out;
}

test("el bloque de tokens de la hoja es el que sale de tokens.ts (lo que se mide es lo que se sirve)", () => {
  const i = css.indexOf(MARCA_INICIO);
  const f = css.indexOf(MARCA_FIN);
  assert.ok(i >= 0 && f > i, "la hoja tiene las marcas del bloque");
  assert.equal(css.slice(i, f + MARCA_FIN.length), bloqueDeTokens(), "bloque viejo: correr `node --import tsx src/design/hoja.ts`");
});

test("la versión de la URL es la del contenido, y ConDiseno pide esa", () => {
  assert.equal(VERSION_HOJA, versionDe(css), "versión vieja: correr `node --import tsx src/design/hoja.ts`");
  assert.deepEqual(HOJAS_DEL_DISENO, [`/diseno/renglon.css?v=${VERSION_HOJA}`]);
});

test("todo está acotado bajo [data-diseno=\"renglon\"] y no hay capas", () => {
  const { selectores, atRules } = reglas(css);
  assert.ok(selectores.length > 100, `se leyeron ${selectores.length} reglas`);
  const sueltos = selectores.flatMap(partirSelectores).filter((s) => !s.startsWith(ALCANCE));
  assert.deepEqual(sueltos, [], "un selector sin el alcance vestiría a CH");
  const permitidas = /^@(media|supports|starting-style|font-face|container)\b|^@keyframes ren-/;
  assert.deepEqual(atRules.filter((a) => !permitidas.test(a)), [], "sólo @media/@supports/@container/@starting-style, @font-face y @keyframes ren-*");
  const codigo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/@layer\b/.test(codigo), "la hoja va SIN capa");
  assert.ok(!/@import\b/.test(codigo), "sin @import (sería otro viaje)");
});

test("materia plana: ni degradés, ni vidrio, ni sombras de dos capas", () => {
  const codigo = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/gradient\(/.test(codigo), "sin degradés");
  assert.ok(!/backdrop-filter/.test(codigo), "sin vidrio");
  // Cada box-shadow es una sola capa (una coma de primer nivel sería una segunda sombra).
  for (const m of codigo.matchAll(/box-shadow:\s*([^;]+);/g)) {
    let nivel = 0;
    let comas = 0;
    for (const ch of m[1]) {
      if (ch === "(") nivel++;
      else if (ch === ")") nivel--;
      else if (ch === "," && nivel === 0) comas++;
    }
    assert.equal(comas, 0, `sombra de dos capas: ${m[1]}`);
  }
});

test("presupuesto: la hoja ≤ 30 KB gzip; la letra, un archivo ≤ 120 KB", () => {
  const gz = gzipSync(css, { level: 9 }).length;
  assert.ok(gz <= 30 * 1024, `la hoja pesa ${gz} B gzip`);
  const letra = statSync(join(RAIZ, "public", LETRA.archivo)).size;
  assert.equal(letra, LETRA.bytes, "fuentes.ts dice el tamaño real del archivo");
  assert.ok(letra <= 120 * 1024, `la letra pesa ${letra} B`);
  assert.equal(PIEL_RENGLON, PIEL, "el atributo que ponen los layouts es el alcance de la hoja");
  assert.equal(LETRA_DEL_DISENO, LETRA.archivo);
});
