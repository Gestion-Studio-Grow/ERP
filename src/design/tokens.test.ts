// El contraste de CADA par de la piel «Renglón», en claro y en oscuro, con los neutros de respaldo y
// con los teñidos del matiz de cada negocio, con el acento real de cada negocio (ACCENT_PRESETS) y
// con el de GSG. Ejecuta la cuenta OKLCH → sRGB → WCAG 2.2
// (color.ts + resolver.ts) sobre los tokens que la hoja sirve (hoja.test.ts vigila que sean los
// mismos). Un par debajo de su mínimo rompe el test con el par, el negocio y los dos colores.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCENT_PRESETS } from "@/lib/branding";
import { fueraDeSrgb, medirPiel } from "./contraste";
import { COLORES, MATIZ_RESPALDO, PARES, SOMBRAS, neutrosTenidos } from "./tokens";

test("cada par de la piel llega a su mínimo WCAG en claro y en oscuro, con cada acento", () => {
  const medidas = medirPiel(ACCENT_PRESETS);
  const negocios = Object.keys(ACCENT_PRESETS).length + 1; // + GSG sin negocio
  assert.equal(medidas.length, PARES.length * negocios * 2 * 2, "se midió cada par, en cada modo, con y sin teñir, para cada negocio");
  const fallan = medidas
    .filter((m) => !m.pasa)
    .map((m) => `${m.modo}${m.tenido ? " (teñido)" : ""} · ${m.negocio}: ${m.par.frente} sobre ${m.par.fondo} = ${m.razon.toFixed(2)} < ${m.par.minimo} (${m.frente} / ${m.fondo}) — ${m.par.que}`);
  assert.deepEqual(fallan, []);
});

test("el texto va a 4,5:1 (la tinta principal a 7:1) y lo gráfico (foco, señales, borde de campo) a 3:1", () => {
  for (const p of PARES) {
    if (p.frente.startsWith("--tinta") || p.frente.startsWith("--text")) assert.ok(p.minimo >= 4.5, `${p.frente} es texto`);
    if (p.frente === "--tinta" && ["--lienzo", "--hoja", "--hundido"].includes(p.fondo)) assert.equal(p.minimo, 7);
  }
});

test("los neutros teñidos son los de respaldo con el matiz del acento (misma luz y mismo croma)", () => {
  for (const modo of ["claro", "oscuro"] as const) {
    const t = neutrosTenidos(modo);
    for (const [k, v] of Object.entries(t)) {
      const m = /^oklch\(from var\(--accent\) (\S+) (\S+) h\)$/.exec(v);
      assert.ok(m, `${k}: ${v}`);
      assert.equal(COLORES[modo][k], `oklch(${m[1]} ${m[2]} ${MATIZ_RESPALDO})`);
    }
  }
});

test("materia plana: ninguna sombra de dos capas ni sombra en lo que no flota", () => {
  for (const modo of ["claro", "oscuro"] as const) {
    for (const [k, v] of Object.entries(SOMBRAS[modo])) {
      if (k === "--sombra-flota") assert.ok(!/,/.test(v.replace(/\([^)]*\)/g, "")), "una sola capa");
      else if (k !== "--shadow-lg") assert.equal(v, "none", k);
    }
  }
});

test("los colores literales de la piel están dentro de sRGB (lo que se mide es lo que se ve)", () => {
  assert.deepEqual(fueraDeSrgb("claro"), []);
  assert.deepEqual(fueraDeSrgb("oscuro"), []);
});
