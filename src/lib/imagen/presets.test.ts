import { test } from "node:test";
import assert from "node:assert/strict";

import { estiloParaRubro, estiloATexto, componerPrompt, ESTILO_GENERICO, ESTILOS } from "./presets";

test("estiloParaRubro: mapea rubros afines al mismo estilo", () => {
  const estetica = estiloParaRubro("estetica");
  assert.equal(estiloParaRubro("peluqueria"), estetica);
  assert.equal(estiloParaRubro("spa"), estetica);
  assert.match(estetica.paleta, /teal/);
});

test("estiloParaRubro: case-insensitive y con espacios", () => {
  assert.equal(estiloParaRubro("  Estetica  "), estiloParaRubro("estetica"));
});

test("estiloParaRubro: sin rubro o rubro desconocido -> generico", () => {
  assert.equal(estiloParaRubro(), ESTILO_GENERICO);
  assert.equal(estiloParaRubro("no-existe"), ESTILO_GENERICO);
});

test("estiloParaRubro: MAGRA (carniceria) es carbon + oro, distinto del generico", () => {
  const carn = estiloParaRubro("carniceria");
  assert.notEqual(carn, ESTILO_GENERICO);
  assert.match(estiloATexto(carn), /carb|oro/);
});

test("componerPrompt: incluye pedido + direccion de arte + baranda de calidad", () => {
  const p = componerPrompt({ prompt: "hero de spa con toallas", rubro: "estetica", aspectRatio: "1:1" });
  assert.match(p, /hero de spa con toallas/);
  assert.match(p, /teal/); // direccion del rubro
  assert.match(p, /sin texto ni logos/); // baranda
});

test("componerPrompt: aspecto horizontal agrega pista de banner/hero", () => {
  const p = componerPrompt({ prompt: "hero", rubro: "estetica", aspectRatio: "16:9" });
  assert.match(p, /banner\/hero/);
});

test("componerPrompt: estiloOverride reemplaza la direccion del rubro", () => {
  const p = componerPrompt({ prompt: "hero", rubro: "estetica", aspectRatio: "1:1", estiloOverride: "acuarela pastel" });
  assert.match(p, /acuarela pastel/);
  assert.ok(!/teal/.test(p));
});

test("ESTILOS: no hay rubros duplicados entre estilos (un rubro, un estilo)", () => {
  const vistos = new Set<string>();
  for (const e of ESTILOS) {
    for (const r of e.rubros) {
      assert.ok(!vistos.has(r), `rubro duplicado entre estilos: ${r}`);
      vistos.add(r);
    }
  }
});
