// Tests del rubro retail `padel` (A Dos Manos Pádel) — tienda minimalista de palas
// y zapatillas. Config pura, patrón node:test. Blindan que el tenant `adosmanos`
// resuelva a una TIENDA (retail) y no a turnos, y que el catálogo mínimo esté bien.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getRetailRubro, resolveRubroIdBySlug, retailWordingForSlug } from "./index";

test("adosmanos resuelve al rubro retail `padel` (tienda, no turnos)", () => {
  assert.equal(resolveRubroIdBySlug("adosmanos"), "padel");
});

test("rubro padel: existe y es una tienda por unidad", () => {
  const padel = getRetailRubro("padel");
  assert.ok(padel, "el rubro padel debería existir en retail");
  assert.ok(padel!.catalog.length > 0);
  assert.ok(padel!.catalog.every((i) => i.sale === "u"), "todo se vende por unidad");
});

test("rubro padel: catálogo de tienda de pádel (palas, zapatillas y accesorios)", () => {
  const padel = getRetailRubro("padel")!;
  const names = padel.catalog.map((i) => i.name.toLowerCase());
  // Rango de una tienda de pádel real (pedido del dueño): palas, zapatillas,
  // pelotas, bolsos/paleteros, grips/overgrips, muñequeras y protectores.
  assert.ok(names.some((n) => n.includes("pala")), "debería haber palas");
  assert.ok(names.some((n) => n.includes("zapatilla")), "debería haber zapatillas");
  assert.ok(names.some((n) => n.includes("pelota")), "debería haber pelotas");
  assert.ok(names.some((n) => n.includes("paletero") || n.includes("mochila")), "debería haber bolsos/paleteros");
  assert.ok(names.some((n) => n.includes("grip")), "debería haber grips/overgrips");
  assert.ok(names.some((n) => n.includes("muñequera")), "debería haber muñequeras");
  assert.ok(names.some((n) => n.includes("protector")), "debería haber protectores");
  // Acotado a una tienda real, sin runaway (referencia de calidad, no de tamaño).
  assert.ok(padel.catalog.length <= 24, "catálogo de tienda, sin decenas de líneas");
});

test("wording de la tienda de pádel por slug", () => {
  const w = retailWordingForSlug("adosmanos");
  assert.equal(w.catalogHeading, "Palas y zapatillas");
  assert.equal(w.itemNoun, "producto");
  assert.equal(w.weightNote, null); // no se vende por peso
});
