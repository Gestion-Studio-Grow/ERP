// Tests del cableado de config de la vidriera para el tenant `shinevelas`.
// Sólo módulos DB-free (copy por tenant + rubro): asegura que la resolución por slug
// quede armada de punta a punta. Corre con `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getStorefrontCopy } from "./storefront";
import { resolveRubroIdBySlug, getRetailRubro } from "@/blueprints/retail/rubros";
import { shippingCost, amountToFreeShipping } from "@/lib/storefront-shipping";
import { groupBySection } from "@/lib/storefront-visual";

// --- Copy por tenant --------------------------------------------------------

test("shinevelas resuelve su copy propio (voz de marca)", () => {
  const copy = getStorefrontCopy("shinevelas");
  assert.ok(copy, "shinevelas debe tener copy propio");
  assert.ok(copy!.tagline.length > 0);
  // La firma de marca "que tu luz nunca se apague" vive en el about.
  assert.match(copy!.about.body, /luz nunca se apague/i);
  assert.ok(copy!.valueProps.length >= 3);
  assert.ok(copy!.reviews.every((r) => r.rating >= 1 && r.rating <= 5));
});

test("shinevelas trae config de envío real (fijo $3.500, gratis desde $25.000)", () => {
  const copy = getStorefrontCopy("shinevelas");
  assert.deepEqual(copy!.shipping, { flatRate: 3500, freeThreshold: 25000 });
  // El cableado copy → cálculo de envío funciona end-to-end.
  assert.equal(shippingCost(8500, "DELIVERY", copy!.shipping), 3500);
  assert.equal(shippingCost(25000, "DELIVERY", copy!.shipping), 0);
  assert.equal(amountToFreeShipping(20000, copy!.shipping), 5000);
});

test("shinevelas trae la VISIÓN experiencial: ritual + sets de regalo + deco", () => {
  const copy = getStorefrontCopy("shinevelas")!;
  // "Armá tu ritual" con pasos.
  assert.ok(copy.ritual, "debe tener sección de ritual");
  assert.ok(copy.ritual!.steps.length >= 3);
  // Sets/combos de regalo con precio.
  assert.ok(copy.giftSets, "debe tener sets de regalo");
  assert.ok(copy.giftSets!.sets.length >= 2);
  assert.ok(copy.giftSets!.sets.some((s) => typeof s.price === "number"));
  // La decoración es una de las líneas destacadas.
  assert.ok(copy.vacioLines.some((l) => /decoraci/i.test(l.title)));
});

test("magra sigue sin experiencia extendida (retrocompatible)", () => {
  const copy = getStorefrontCopy("magra")!;
  assert.equal(copy.shipping, undefined);
  assert.equal(copy.ritual, undefined);
  assert.equal(copy.giftSets, undefined);
});

test("slug desconocido → sin copy (cae al wording del rubro)", () => {
  assert.equal(getStorefrontCopy("no-existe"), null);
  assert.equal(getStorefrontCopy(null), null);
});

// --- Rubro por tenant -------------------------------------------------------

test("shinevelas mapea al rubro `velas` y su catálogo es visual, por unidad", () => {
  assert.equal(resolveRubroIdBySlug("shinevelas"), "velas");
  const rubro = getRetailRubro("velas");
  assert.ok(rubro, "el rubro velas debe existir");
  assert.ok(rubro!.catalog.length >= 6);
  // Rubro visual, todo por unidad (sin balanza).
  assert.ok(rubro!.catalog.every((c) => c.sale === "u"));
  assert.equal(rubro!.wording.weightNote, null);
  assert.ok(rubro!.modules.includes("venta-unidad"));
  assert.ok(!rubro!.modules.includes("venta-peso"));
});

test("el catálogo del rubro velas cubre las 4 secciones (velas/aromas/deco/accesorios)", () => {
  const rubro = getRetailRubro("velas")!;
  const groups = groupBySection(rubro.catalog);
  const ids = groups.map((g) => g.section.id);
  for (const s of ["velas", "aromas", "decoracion", "accesorios"]) {
    assert.ok(ids.includes(s as (typeof ids)[number]), `falta la sección ${s} en el catálogo`);
  }
});
