// Tests del mapeo slug→marca (fix J-2, reporte QA 2026-07-06): getTenantBrand()
// usaba `tenant.findFirst()` sin `where`, así que siempre devolvía la marca del
// tenant más viejo (CH) sin importar qué dominio estaba sirviendo el request.
// brandForSlug() es el lookup puro, ahora resuelto por el tenant ACTUAL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { brandForSlug, resolveAccent, invertTheme } from "./branding";

test("brandForSlug: cada tenant real tiene su propia marca (no comparten identidad)", () => {
  const slugs = ["beauty-spa", "magra", "shinevelas", "adosmanos"];
  const brands = slugs.map(brandForSlug);
  const names = brands.map((b) => b.name);
  assert.equal(new Set(names).size, names.length, "nombres de marca duplicados entre tenants");
  assert.deepEqual(names, ["CH Estética", "Magra", "Shine", "A Dos Manos"]);
});

test("brandForSlug: slug desconocido o null cae al brand por defecto (nunca al de otro tenant)", () => {
  const unknown = brandForSlug("un-slug-que-no-existe");
  const nullSlug = brandForSlug(null);
  assert.equal(unknown.name, "ERP");
  assert.equal(nullSlug.name, "ERP");
  assert.equal(unknown.name, nullSlug.name);
});

test("brandForSlug: nunca devuelve la marca de CH para el slug de otro tenant", () => {
  for (const slug of ["magra", "shinevelas", "adosmanos", "otro-tenant", null]) {
    assert.notEqual(brandForSlug(slug).name, "CH Estética");
  }
});

test("resolveAccent + invertTheme: el back va en el tema opuesto al front de cada tenant", () => {
  for (const slug of ["beauty-spa", "magra", "shinevelas", "adosmanos"]) {
    const brand = brandForSlug(slug);
    const backTheme = invertTheme(brand.frontTheme);
    assert.notEqual(backTheme, brand.frontTheme);
    const front = resolveAccent(brand.preset, brand.frontTheme);
    const back = resolveAccent(brand.preset, backTheme);
    assert.ok(front.accent && back.accent);
    assert.notEqual(front.accent, back.accent, "el acento debería variar de tono entre front y back");
  }
});
