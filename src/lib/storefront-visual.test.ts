// Tests de la lógica pura del visual/categorización de producto (storefront-visual.ts).
// Sin DB ni red: sólo las funciones puras y determinísticas. Corre con `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyProduct,
  productGlyph,
  productSection,
  groupBySection,
  PRODUCT_SECTIONS,
  nameHash,
  haloShift,
  productGradient,
} from "./storefront-visual";

// --- classifyProduct --------------------------------------------------------

test("classifyProduct: reconoce velas, difusores y textiles del catálogo Shine", () => {
  assert.equal(classifyProduct("Vela Vainilla y Canela"), "vela");
  assert.equal(classifyProduct("Difusor Coco y Vainilla"), "difusor");
  assert.equal(classifyProduct("Aromatizante Textil Flores Blancas"), "textil");
});

test("classifyProduct: reconoce decoración y accesorios (vision experiencial)", () => {
  assert.equal(classifyProduct("Portavela de cerámica"), "deco");
  assert.equal(classifyProduct("Florero de vidrio soplado"), "deco");
  assert.equal(classifyProduct("Espejo decorativo redondo"), "deco");
  assert.equal(classifyProduct("Cortamechas de acero"), "accesorio");
  assert.equal(classifyProduct("Fósforos largos deco"), "accesorio");
  assert.equal(classifyProduct("Sahumerios de palo santo"), "difusor");
});

test("classifyProduct: 'Vela decorativa' es vela, no deco (prioridad de orden)", () => {
  // "Portavela" gana a "vela" (objeto deco), pero "Vela decorativa" sigue siendo vela.
  assert.equal(classifyProduct("Vela decorativa tallada"), "vela");
  assert.equal(classifyProduct("Vela artesanal de cera de abeja"), "vela");
  assert.equal(classifyProduct("Portavela de vidrio"), "deco");
});

test("classifyProduct: es case-insensitive y cae a genérico sin match", () => {
  assert.equal(classifyProduct("VELA SÁNDALO"), "vela");
  assert.equal(classifyProduct("Producto raro sin categoría"), "generico");
  assert.equal(classifyProduct(""), "generico");
});

// --- productGlyph -----------------------------------------------------------

test("productGlyph: un glifo por categoría, estable y distinto entre categorías", () => {
  assert.equal(productGlyph("Vela Lavanda"), productGlyph("Vela Sándalo"));
  assert.notEqual(productGlyph("Vela Lavanda"), productGlyph("Difusor Jazmín"));
  assert.notEqual(productGlyph("Portavela de cerámica"), productGlyph("Cortamechas"));
});

// --- productSection / groupBySection ----------------------------------------

test("productSection: mapea cada categoría a su sección de recorrido", () => {
  assert.equal(productSection("Vela Lavanda"), "velas");
  assert.equal(productSection("Difusor Jazmín"), "aromas");
  assert.equal(productSection("Aromatizante Textil Talco"), "aromas");
  assert.equal(productSection("Florero de vidrio"), "decoracion");
  assert.equal(productSection("Cortamechas"), "accesorios");
});

test("groupBySection: agrupa en secciones ordenadas y omite las vacías", () => {
  const products = [
    { name: "Vela Lavanda" },
    { name: "Difusor Jazmín" },
    { name: "Portavela de cerámica" },
    { name: "Vela Sándalo" },
  ];
  const groups = groupBySection(products);
  assert.deepEqual(groups.map((g) => g.section.id), ["velas", "aromas", "decoracion"]);
  assert.equal(groups[0].items.length, 2); // dos velas
  assert.equal(groups.find((g) => g.section.id === "accesorios"), undefined); // vacía → omitida
});

test("groupBySection: todo producto aterriza en exactamente una sección", () => {
  const products = PRODUCT_SECTIONS.map((s) => ({ name: `demo ${s.id}` }));
  const total = groupBySection(products).reduce((n, g) => n + g.items.length, 0);
  assert.equal(total, products.length);
});

// --- nameHash / haloShift (determinismo) ------------------------------------

test("nameHash: determinístico y no negativo (djb2 >>> 0)", () => {
  assert.equal(nameHash("Vela Lavanda"), nameHash("Vela Lavanda"));
  assert.ok(nameHash("Difusor Jazmín") >= 0);
  assert.notEqual(nameHash("Vela A"), nameHash("Vela B"));
});

test("haloShift: siempre en el rango 0–99 (posición %)", () => {
  for (const name of ["Vela A", "Difusor B", "Textil C", "", "x".repeat(50)]) {
    const s = haloShift(name);
    assert.ok(s >= 0 && s < 100, `haloShift(${name}) fuera de rango: ${s}`);
  }
});

// --- productGradient --------------------------------------------------------

test("productGradient: determinístico (mismo nombre → mismo gradiente)", () => {
  assert.equal(productGradient("Vela Lavanda"), productGradient("Vela Lavanda"));
});

test("productGradient: usa el acento del tenant y la superficie del token", () => {
  const g = productGradient("Vela Lavanda");
  assert.ok(g.includes("var(--accent)"), "debe teñir con el acento del tenant");
  assert.ok(g.includes("var(--surface-raised)"), "debe apoyarse en el token de superficie");
  assert.ok(g.startsWith("radial-gradient("), "es un halo radial");
});
