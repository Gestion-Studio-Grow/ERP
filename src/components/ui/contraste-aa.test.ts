// PLAT-005 · Contraste AA (≥ 4,5:1) de la pestaña activa y del kicker de CH, medido con Playwright:
//   · pestaña activa: #0071e3 sobre #f4f6f8 = 4,34:1 → --accent-ink (76 % del acento + negro) = 6,61:1.
//   · .chf-kicker (12–14 px): --text-muted #736a58 sobre el sunken #ece7db = 4,33:1 → --text-faint = 4,86:1.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { razonContraste, type Rgb } from "@/design/color";
import { CSS_CH } from "@/app/(site)/_ch/estilos-ch";

const css = readFileSync(path.join(__dirname, "..", "..", "app", "globals.css"), "utf8");
const hex = (s: string): Rgb => ({ r: parseInt(s.slice(1, 3), 16) / 255, g: parseInt(s.slice(3, 5), 16) / 255, b: parseInt(s.slice(5, 7), 16) / 255, a: 1 });
/** color-mix(in srgb, X p%, #000): cada canal por p. */
const conNegro = (c: Rgb, p: number): Rgb => ({ r: c.r * p, g: c.g * p, b: c.b * p, a: 1 });
const token = (nombre: string): string => {
  const m = css.match(new RegExp(`:root\\s*\\{[\\s\\S]*?--${nombre}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(m, `--${nombre} en :root`);
  return m[1];
};

test("la pestaña activa usa --accent-ink, no el acento crudo", () => {
  const pestanas = readFileSync(path.join(__dirname, "Pestanas.tsx"), "utf8");
  assert.match(pestanas, /color: "var\(--accent-ink,/);
  assert.match(pestanas, /style=\{p\.actual \? ACTIVA_AA : undefined\}/);
  const fondo = hex("#f4f6f8");
  const azul = hex("#0071e3");
  assert.ok(razonContraste(azul, fondo) < 4.5, "el acento crudo no llega (por eso el cambio)");
  const tinta = razonContraste(conNegro(azul, 0.76), fondo);
  assert.ok(tinta >= 4.5, `accent-ink sobre #f4f6f8 = ${tinta.toFixed(2)}`);
});

test("el kicker de CH usa --text-faint y pasa AA sobre el sunken y sobre el hueso", () => {
  const regla = CSS_CH.match(/\.chf-kicker\{[^}]*\}/)?.[0] ?? "";
  assert.match(regla, /color:var\(--text-faint\)/);
  const tinta = hex(token("text-faint"));
  for (const fondo of [token("surface-sunken"), token("surface")]) {
    const r = razonContraste(tinta, hex(fondo));
    assert.ok(r >= 4.5, `--text-faint sobre ${fondo} = ${r.toFixed(2)}`);
  }
});
