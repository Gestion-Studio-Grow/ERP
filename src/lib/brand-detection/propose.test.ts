import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeBranding, nearestPreset } from "./propose";
import { extractBrandSignals } from "./extract";
import type { BrandSignals } from "./extract";

test("nearestPreset: un oxblood de marca mapea al preset 'oxblood'", () => {
  assert.equal(nearestPreset("#6e1e28").preset, "oxblood");
  assert.equal(nearestPreset("#7b2d3b").preset, "oxblood"); // el propio preset
});

test("nearestPreset: un teal mapea a 'petroleo'; un dorado a 'ambar'", () => {
  assert.equal(nearestPreset("#2c6e77").preset, "petroleo");
  assert.equal(nearestPreset("#9a6a1f").preset, "ambar");
});

test("proposeBranding: Magra → acento de theme-color, preset oxblood, logo, alta confianza", () => {
  const signals: BrandSignals = {
    title: "Magra",
    themeColor: "#6e1e28",
    colors: [{ hex: "#6e1e28", count: 4 }],
    logo: "https://magra.example/logo.svg",
    fonts: ["Cormorant Garamond"],
  };
  const p = proposeBranding(signals);
  assert.equal(p.accentHex, "#6e1e28");
  assert.equal(p.nearestPreset, "oxblood");
  assert.equal(p.name, "Magra");
  assert.equal(p.logoUrl, "https://magra.example/logo.svg");
  assert.equal(p.confidence, "high");
  assert.ok(p.notes.some((n) => /theme-color/i.test(n)));
});

test("proposeBranding: sin theme-color cae al color más frecuente", () => {
  const p = proposeBranding({ title: "X", themeColor: null, colors: [{ hex: "#2f7d66", count: 2 }], logo: null, fonts: [] });
  assert.equal(p.accentHex, "#2f7d66");
  assert.equal(p.nearestPreset, "verde");
  assert.ok(p.notes.some((n) => /más frecuente/i.test(n)));
});

test("proposeBranding: sin señales de color → default petróleo, baja confianza, nota de revisión", () => {
  const p = proposeBranding({ title: null, themeColor: null, colors: [], logo: null, fonts: [] });
  assert.equal(p.accentHex, null);
  assert.equal(p.nearestPreset, "petroleo");
  assert.equal(p.confidence, "low");
  assert.ok(p.notes.some((n) => /revisar a mano/i.test(n)));
});

test("proposeBranding: end-to-end desde HTML (extract → propose)", () => {
  const html = `<title>Shine</title><meta name="theme-color" content="#e0a83e">
    <link rel="apple-touch-icon" href="/logo.png"><style>.a{color:#e0a83e}.b{color:#e0a83e}</style>`;
  const p = proposeBranding(extractBrandSignals(html, "https://shine.example"));
  assert.equal(p.name, "Shine");
  assert.equal(p.nearestPreset, "ambar");
  assert.equal(p.logoUrl, "https://shine.example/logo.png");
});
