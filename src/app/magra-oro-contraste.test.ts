// ============================================================================
// MAGRA BOUTIQUE — el contraste AA de los tokens grafito y oro, MEDIDO (no a ojo).
// ============================================================================
//
// Reingeniería de Magra, diseño §1.2 · Tanda 1 · agente 1G. Lee el bloque `[data-brand="magra"]` del
// final de globals.css tal cual lo sirve la hoja, resuelve cada token (los `var()` del mismo bloque y
// lo translúcido compuesto sobre su fondo, como pinta el navegador) y mide la razón WCAG 2.2 con la
// misma cuenta que el test de la piel (src/design/color.ts). Un par debajo de su mínimo rompe con el
// par y los dos colores: se ajusta el TOKEN, nunca el componente.
//
// Además: el preset `oro` de branding.ts es el mismo oro del bloque (una sola historia), y sus dos
// tonos pasan AA con su tinta (el claro también como texto sobre el papel de la vidriera de Magra).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACCENT_PRESETS, brandForSlug } from "@/lib/branding";
import { componer, leerColor, oklchASrgb, razonContraste, type Rgb } from "@/design/color";

const CSS = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");

/** El cuerpo del bloque de Magra boutique: el único que abre con `[data-brand="magra"],`. */
function bloqueMagra(): string {
  const inicio = CSS.indexOf('[data-brand="magra"],\n');
  assert.ok(inicio >= 0, "globals.css tiene el bloque [data-brand=\"magra\"]");
  assert.equal(CSS.indexOf('[data-brand="magra"],\n', inicio + 1), -1, "un solo bloque [data-brand=\"magra\"]");
  const abre = CSS.indexOf("{", inicio);
  const cierra = CSS.indexOf("}", abre);
  return CSS.slice(abre + 1, cierra);
}

function tokens(): Record<string, string> {
  const cuerpo = bloqueMagra().replace(/\/\*[\s\S]*?\*\//g, "");
  const t: Record<string, string> = {};
  for (const m of cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) t[m[1]] = m[2].trim();
  return t;
}

const T = tokens();

/** Un token resuelto a color: sigue `var(--x)` dentro del bloque; `rgba()` se lee como sRGB con alfa. */
function color(nombre: string, vistos: string[] = []): Rgb {
  const v = T[nombre];
  assert.ok(v, `el bloque define ${nombre}`);
  assert.ok(!vistos.includes(nombre), `var() circular en ${nombre}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  if (ref) return color(ref[1], [...vistos, nombre]);
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(v);
  if (rgba) return { r: +rgba[1] / 255, g: +rgba[2] / 255, b: +rgba[3] / 255, a: +rgba[4] };
  return oklchASrgb(leerColor(v));
}

/** Razón WCAG de `frente` sobre `fondo`; lo translúcido se compone (el fondo, sobre `sobre`). */
function razon(frente: string, fondo: string, sobre = "--surface"): number {
  let f = color(fondo);
  if (f.a < 1) f = componer(f, color(sobre));
  let c = color(frente);
  if (c.a < 1) c = componer(c, f);
  return razonContraste(c, f);
}

const hex = (s: string) => oklchASrgb(leerColor(s));
const razonHex = (a: string, b: string) => razonContraste(hex(a), hex(b));

const FONDOS = ["--surface", "--surface-raised", "--surface-sunken"] as const;

// [frente, mínimo, qué es] — texto 4,5:1 (1.4.3); lo gráfico (foco) 3:1 (1.4.11).
const SOBRE_LOS_FONDOS: Array<[string, number, string]> = [
  ["--text-strong", 7, "cifras y títulos (la tinta principal a 7:1, como la piel)"],
  ["--text", 4.5, "cuerpo"],
  ["--text-muted", 4.5, "rótulos"],
  ["--text-faint", 4.5, "ayuda"],
  ["--accent", 4.5, "el total en oro y los chips activos"],
  ["--accent-ink", 4.5, "oro como texto chico (links, «Confirmado»)"],
  ["--success", 4.5, "«Cobrada»"],
  ["--warning", 4.5, "«Pesó más»"],
  ["--danger", 4.5, "«Faltan»"],
  ["--focus-ring", 3, "el anillo de foco"],
];

test("cada texto y señal del panel llega a AA sobre el fondo, la tarjeta y el pie de cobro", () => {
  const fallan: string[] = [];
  for (const fondo of FONDOS) {
    for (const [frente, minimo, que] of SOBRE_LOS_FONDOS) {
      const r = razon(frente, fondo);
      if (r < minimo) fallan.push(`${frente} sobre ${fondo} = ${r.toFixed(2)} < ${minimo} — ${que}`);
    }
  }
  assert.deepEqual(fallan, []);
});

test("la tinta sobre el oro: el botón «Cobrar» en reposo y al pasar, a AA", () => {
  assert.ok(razon("--text-on-accent", "--accent") >= 4.5, `ink/oro = ${razon("--text-on-accent", "--accent").toFixed(2)}`);
  assert.ok(razon("--text-on-accent", "--accent-hover") >= 4.5, `ink/hover = ${razon("--text-on-accent", "--accent-hover").toFixed(2)}`);
});

test("el oro sobre su lavado (chip activo, «Confirmado») y las señales sobre los suyos, a AA", () => {
  const pares: Array<[string, string]> = [
    ["--accent-ink", "--accent-soft"],
    ["--info", "--info-soft"],
    ["--success", "--success-soft"],
    ["--warning", "--warning-soft"],
    ["--danger", "--danger-soft"],
  ];
  const fallan: string[] = [];
  for (const sobre of ["--surface", "--surface-raised"]) {
    for (const [frente, fondo] of pares) {
      const r = razon(frente, fondo, sobre);
      if (r < 4.5) fallan.push(`${frente} sobre ${fondo} (en ${sobre}) = ${r.toFixed(2)}`);
    }
  }
  assert.deepEqual(fallan, []);
});

test("los valores del diseño §1.2: oro sobre grafito ≈ 8:1 y la tinta sobre el oro ≈ 8:1 (con la tolerancia del «≈»)", () => {
  assert.ok(razon("--accent", "--surface") >= 7, `oro/grafito = ${razon("--accent", "--surface").toFixed(2)}`);
  assert.ok(razon("--text-on-accent", "--accent") >= 7, `tinta/oro = ${razon("--text-on-accent", "--accent").toFixed(2)}`);
});

test("el rótulo de la marca: hueso sobre oxblood, a AA", () => {
  assert.ok(razon("--text-strong", "--magra-marca") >= 4.5, `hueso/oxblood = ${razon("--text-strong", "--magra-marca").toFixed(2)}`);
});

test("el panel es oscuro: el fondo es más oscuro que la tarjeta y declara color-scheme dark", () => {
  assert.match(bloqueMagra(), /color-scheme:\s*dark/);
  const [l1, l2] = [color("--surface"), color("--surface-raised")].map((c) => c.r + c.g + c.b);
  assert.ok(l1 < l2, "lo que está más cerca de la mano es más claro (tarjeta > fondo)");
});

test("el preset `oro` de branding.ts es el oro del bloque y sus dos tonos pasan con su tinta", () => {
  const oro = ACCENT_PRESETS.oro;
  assert.equal(oro.dark, T["--accent"], "el acento oscuro del preset = --accent del bloque");
  assert.equal(oro.onDark, T["--text-on-accent"], "su tinta = --text-on-accent del bloque");
  assert.ok(razonHex(oro.onDark, oro.dark) >= 4.5, "tinta sobre el oro oscuro");
  assert.ok(razonHex(oro.onLight, oro.light) >= 4.5, `blanco sobre el oro claro = ${razonHex(oro.onLight, oro.light).toFixed(2)}`);
  // El tono claro también es texto (links) sobre fondo claro: el blanco y el papel de la vidriera de Magra.
  const papel = brandForSlug("magra").layout?.palette?.surface;
  assert.ok(papel, "la vidriera de Magra declara su papel");
  assert.ok(razonHex(oro.light, "#ffffff") >= 4.5);
  assert.ok(razonHex(oro.light, papel) >= 4.5, `oro claro sobre el papel = ${razonHex(oro.light, papel).toFixed(2)}`);
});

test("el bloque sólo vive bajo [data-brand=\"magra\"]: ningún selector toca a otro negocio", () => {
  const inicio = CSS.indexOf('[data-brand="magra"],\n');
  const selector = CSS.slice(inicio, CSS.indexOf("{", inicio));
  const partes = selector.split(",").map((s) => s.trim());
  assert.deepEqual(partes, ['[data-brand="magra"]', '[data-skin="fable"][data-brand="magra"][data-theme]']);
  // A igual especificidad gana el que viene después: tiene que ir detrás de la estética de Magra y del
  // skin Fable oscuro (los dos los repite la hoja; cuenta la última aparición de cada uno).
  for (const otro of ['[data-skin="fable"][data-theme="dark"][data-estetica="magra"]', '[data-skin="fable"][data-theme="dark"] {']) {
    assert.ok(CSS.lastIndexOf(otro) < inicio, `el bloque de Magra boutique va después de ${otro}`);
  }
});
