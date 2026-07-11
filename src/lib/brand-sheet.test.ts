import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBrandSheet } from "./brand-sheet";

test("velas-demo (DB) → pack boutique-velas, acento ámbar, back OSCURO — no CH", () => {
  const s = buildBrandSheet({ name: "Velas DEMO", accentPreset: "ambar", frontTheme: "light", blueprintId: "velas" });
  assert.equal(s.themeId, "boutique-velas");
  assert.equal(s.accentPreset, "ambar");
  assert.equal(s.frontTheme, "light");
  assert.equal(s.backTheme, "dark");
  assert.equal(s.name, "Velas DEMO");
  assert.equal(s.pack.display, "fraunces");
});

test("estetica-demo vs velas-demo: packs distintos (no el mismo backoffice)", () => {
  const est = buildBrandSheet({ name: "Estética DEMO", accentPreset: "rosa", frontTheme: "light", blueprintId: "servicios" });
  const vel = buildBrandSheet({ name: "Velas DEMO", accentPreset: "ambar", frontTheme: "light", blueprintId: "velas" });
  assert.equal(est.themeId, "servicios-spa");
  assert.equal(vel.themeId, "boutique-velas");
  assert.notEqual(est.pack.dark.surface, vel.pack.dark.surface, "el fondo del backoffice debe diferir");
  assert.notEqual(est.pack.display, vel.pack.display, "la tipografía debe diferir");
});

test("tenant sin ficha → base neutra GSG + acento NO petróleo (nunca CH)", () => {
  const s = buildBrandSheet({ name: null, accentPreset: null, frontTheme: null, blueprintId: null });
  assert.equal(s.themeId, "gsg-base");
  assert.notEqual(s.accentPreset, "petroleo", "un tenant sin ficha no debe heredar el acento de CH");
  assert.equal(s.name, "Mi negocio");
  assert.equal(s.frontTheme, "light");
});

test("preset inválido en DB → cae al neutro (no rompe, no CH)", () => {
  const s = buildBrandSheet({ name: "X", accentPreset: "fucsia-inexistente", frontTheme: "light", blueprintId: "padel" });
  assert.equal(s.accentPreset, "celeste");
  assert.equal(s.themeId, "retail-deporte");
});

test("magra-demo → boutique-carne, oxblood; front dark → back light", () => {
  const s = buildBrandSheet({ name: "Magra DEMO", accentPreset: "oxblood", frontTheme: "dark", blueprintId: "carniceria" });
  assert.equal(s.themeId, "boutique-carne");
  assert.equal(s.accentPreset, "oxblood");
  assert.equal(s.frontTheme, "dark");
  assert.equal(s.backTheme, "light");
});
