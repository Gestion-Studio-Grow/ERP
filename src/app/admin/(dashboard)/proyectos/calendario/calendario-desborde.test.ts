// PLAT-005 · Los eventos del calendario no se salen de su día (medido a 1440 px: 20 de 20 se salían,
// los «+N más» incluidos). Causa: la columna implícita del <ul> (grid) es `auto` y el <li> sin
// min-w-0 toma el ancho del texto sin cortar (truncate = nowrap). Este test frena que vuelva.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const fuente = readFileSync(path.join(__dirname, "page.tsx"), "utf8");
const grilla = fuente.slice(fuente.indexOf('aria-label="Grilla del mes"'), fuente.indexOf("{diaPedido &&"));

test("la lista de cada día tiene columna minmax(0,1fr) y min-w-0", () => {
  assert.match(grilla, /<ul className="grid min-w-0 grid-cols-\[minmax\(0,1fr\)\] gap-0\.5">/);
});

test("cada <li> de la grilla lleva min-w-0 (eventos y «+N más»)", () => {
  const lis = grilla.match(/<li\b[^>]*>/g) ?? [];
  assert.equal(lis.length, 2, "un <li> por evento y uno para «+N más»");
  for (const li of lis) assert.match(li, /className="min-w-0"/, li);
});

test("el evento y el «+N más» cortan con puntos suspensivos", () => {
  const enlaces = grilla.match(/<Link [^>]*className=[^>]*>/g) ?? [];
  assert.equal(enlaces.length, 2);
  for (const l of enlaces) assert.match(l, /\btruncate\b/, l);
});
