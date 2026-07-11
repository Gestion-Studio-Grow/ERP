import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBrandSignals } from "./extract";

// Fixture: una web de Magra plausible (oxblood, logo, tipografía, banner de estilos).
const MAGRA_HTML = `<!doctype html><html><head>
  <title>Magra · Canning — Carnicería boutique</title>
  <meta property="og:site_name" content="Magra Meat Market">
  <meta name="theme-color" content="#6e1e28">
  <meta property="og:image" content="/img/og-magra.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="icon" href="/favicon.ico">
  <style>
    :root { --brand: #6e1e28; }
    body { font-family: "Cormorant Garamond", Georgia, serif; color: #1a1a1a; background: #ffffff; }
    .cta { background: #6e1e28; color: #fff; }
    .accent { border-color: rgb(110, 30, 40); }
    .muted { color: #888888; }
  </style>
</head><body>
  <img src="/logo-magra.svg" alt="Logo Magra" class="site-logo">
</body></html>`;

test("extractBrandSignals: nombre desde og:site_name (gana al <title>)", () => {
  const s = extractBrandSignals(MAGRA_HTML, "https://magra.example");
  assert.equal(s.title, "Magra Meat Market");
});

test("extractBrandSignals: theme-color normalizado", () => {
  const s = extractBrandSignals(MAGRA_HTML, "https://magra.example");
  assert.equal(s.themeColor, "#6e1e28");
});

test("extractBrandSignals: colores no-neutros por frecuencia; descarta blanco/negro/gris", () => {
  const s = extractBrandSignals(MAGRA_HTML, "https://magra.example");
  assert.equal(s.colors[0].hex, "#6e1e28", "el oxblood debería ser el color dominante");
  assert.ok(s.colors[0].count >= 3);
  const hexes = s.colors.map((c) => c.hex);
  assert.ok(!hexes.includes("#ffffff"), "no debería incluir blanco");
  assert.ok(!hexes.includes("#888888"), "no debería incluir gris");
  assert.ok(!hexes.includes("#1a1a1a"), "no debería incluir casi-negro");
});

test("extractBrandSignals: logo absolutizado (apple-touch-icon tiene prioridad)", () => {
  const s = extractBrandSignals(MAGRA_HTML, "https://magra.example");
  assert.equal(s.logo, "https://magra.example/apple-touch-icon.png");
});

test("extractBrandSignals: tipografías, sin las genéricas", () => {
  const s = extractBrandSignals(MAGRA_HTML, "https://magra.example");
  assert.deepEqual(s.fonts, ["Cormorant Garamond"]);
});

test("extractBrandSignals: HTML pobre → señales vacías, sin romper", () => {
  const s = extractBrandSignals("<html><head></head><body>hola</body></html>", "https://x.example");
  assert.equal(s.themeColor, null);
  assert.equal(s.logo, null);
  assert.deepEqual(s.colors, []);
  assert.deepEqual(s.fonts, []);
});
