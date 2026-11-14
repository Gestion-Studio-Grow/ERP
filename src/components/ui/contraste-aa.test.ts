// PLAT-005 · Contraste AA (≥ 4,5:1) del kicker del sitio de CH.
// Antes: --text-muted sobre el sunken = 4,33:1. Ahora: --text-muted mezclado 40 % hacia --text (color-mix en sRGB).
// Se verifica en CADA bloque del CSS global que define los cuatro tokens (paleta raíz, oscuro, temas de rubro),
// y que la mezcla nunca empeora respecto de --text-muted solo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { razonContraste, type Rgb } from "@/design/color";
import { CSS_CH } from "@/app/(site)/_ch/estilos-ch";

const css = readFileSync(path.join(__dirname, "..", "..", "app", "globals.css"), "utf8");
const hex = (s: string): Rgb => ({ r: parseInt(s.slice(1, 3), 16) / 255, g: parseInt(s.slice(3, 5), 16) / 255, b: parseInt(s.slice(5, 7), 16) / 255, a: 1 });
const mezcla = (a: Rgb, b: Rgb, pa: number): Rgb => ({ r: a.r * pa + b.r * (1 - pa), g: a.g * pa + b.g * (1 - pa), b: a.b * pa + b.b * (1 - pa), a: 1 });
const tok = (bloque: string, n: string) => bloque.match(new RegExp(`--${n}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];

/** Bloques `selector { ... }` que definen muted, text, surface y surface-sunken. */
const bloques = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, sel, cuerpo]) => ({ sel: sel.trim(), muted: tok(cuerpo, "text-muted"), text: tok(cuerpo, "text"), surface: tok(cuerpo, "surface"), sunken: tok(cuerpo, "surface-sunken") }))
  .filter((b) => b.muted && b.text && b.surface && b.sunken);

test("el kicker de CH usa la mezcla muted→text", () => {
  const regla = CSS_CH.match(/\.chf-kicker\{[^}]*\}/)?.[0] ?? "";
  assert.match(regla, /color:color-mix\(in srgb,var\(--text-muted\) 60%,var\(--text\)\)/);
});

test("la mezcla pasa AA en la paleta raíz y nunca empeora respecto de --text-muted", () => {
  assert.ok(bloques.length >= 2, `bloques de tema encontrados: ${bloques.length}`);
  for (const b of bloques) {
    const kicker = mezcla(hex(b.muted!), hex(b.text!), 0.6);
    for (const fondo of [b.surface!, b.sunken!]) {
      const antes = razonContraste(hex(b.muted!), hex(fondo));
      const ahora = razonContraste(kicker, hex(fondo));
      assert.ok(ahora >= antes, `${b.sel.slice(0, 60)} sobre ${fondo}: ${ahora.toFixed(2)} < ${antes.toFixed(2)}`);
    }
  }
  const raiz = bloques.find((b) => /^:root$/.test(b.sel)) ?? bloques[0];
  const k = mezcla(hex(raiz.muted!), hex(raiz.text!), 0.6);
  for (const fondo of [raiz.surface!, raiz.sunken!]) {
    const r = razonContraste(k, hex(fondo));
    assert.ok(r >= 4.5, `raíz sobre ${fondo} = ${r.toFixed(2)}`);
  }
});
