// La bandeja del mostrador boutique con la piel de Vender y sin scroll de costado (tanda práctica, R-3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CSS_DE_LA_PIEL, PIEL_DEL_MOSTRADOR, TOKENS_HEREDADOS } from "./piel-de-la-bandeja";

const leer = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("hereda TODOS los colores que la estética de Magra pone en el panel (los de Vender)", () => {
  const globales = readFileSync(new URL("../../../../globals.css", import.meta.url), "utf8");
  const bloque = globales.match(/\[data-skin="fable"\]\[data-estetica="magra"\],\s*\[data-skin="fable"\]\[data-theme="dark"\]\[data-estetica="magra"\] \{([^}]*)\}/);
  assert.ok(bloque, "el bloque de la estética de Magra");
  const colores = [...bloque[1].matchAll(/(--[a-z-]+):/g)].map((m) => m[1]).filter((t) => !/^--(font|radius|shadow)/.test(t));
  assert.ok(colores.length > 20, String(colores.length));
  for (const t of colores) assert.ok((TOKENS_HEREDADOS as readonly string[]).includes(t), `${t} se hereda`);
  for (const t of TOKENS_HEREDADOS) assert.match(CSS_DE_LA_PIEL, new RegExp(`${t}:inherit;`));
  // La paleta interna del renglón sale de lo heredado (nunca un color propio, claro).
  assert.match(CSS_DE_LA_PIEL, /--lienzo:var\(--surface\);/);
  assert.match(CSS_DE_LA_PIEL, /--tinta:var\(--text-strong\);/);
  assert.doesNotMatch(CSS_DE_LA_PIEL, /oklch|#[0-9a-f]{3,6}\b/i, "sin colores escritos a mano");
});

test("a 390 px la barra y las solapas bajan de renglón (sin scroll de costado) y todo va acotado a la piel", () => {
  const raiz = `[data-diseno="renglon"][data-piel="${PIEL_DEL_MOSTRADOR}"]`;
  const reglas = CSS_DE_LA_PIEL.split("}").map((r) => r.replace(/^@media[^{]*\{/, "")).filter((r) => r.includes("{"));
  for (const r of reglas) assert.ok(r.trimStart().startsWith(raiz), `acotada: ${r.slice(0, 80)}`);
  assert.match(CSS_DE_LA_PIEL, /\[data-ui="filtros"\]\{flex-wrap:wrap;overflow-x:visible;/);
  assert.match(CSS_DE_LA_PIEL, /:has\(>input\[type="search"\]\)\{flex:1 1 100%;/, "el buscador en su fila");
  assert.match(CSS_DE_LA_PIEL, /\[data-bandeja="columnas"\]>\[role="tablist"\]\{flex-wrap:wrap;overflow-x:visible;\}/);
});

test("sólo la bandeja del boutique la recibe: la de siempre (CH) queda igual", () => {
  const pagina = leer("../page.tsx");
  assert.equal(pagina.match(/<PielDeLaBandeja>/g)?.length, 1);
  assert.match(pagina, /if \(nuevo\) return pagina;\n[^\n]*\n[^\n]*\n\s*return <PielDeLaBandeja>\{pagina\}<\/PielDeLaBandeja>;/);
  const raiz = leer("./PielDeLaBandeja.tsx");
  assert.match(raiz, /<div data-diseno=\{PIEL_RENGLON\} data-piel=\{PIEL_DEL_MOSTRADOR\}>/);
  assert.match(raiz, /<ConDiseno nuevo precargarLetra=\{false\}>/);
});
