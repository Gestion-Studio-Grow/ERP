// DEMO GSG (src/lib/marca-demo.ts): Magra se muestra con la marca de GSG; CH y el resto, byte-idénticos a antes.
// Corre: node --import tsx --test src/lib/marca-demo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MARCA_DEMO_GSG, contactoDeLaDemo, presentaComoDemoGsg, presentacionDe } from "./marca-demo";
import { brandForSlug, ACCENT_PRESETS } from "./branding";
import { esteticaBackoffice } from "./estetica-backoffice";
import { getStorefrontCopy, resolveTenantBrandId } from "@/tenants/storefront";
import { ogDelNegocio } from "./seo/og";

test("magra y sus locales se presentan como demo GSG; slug vacío o ajeno, no", () => {
  for (const s of ["magra", "MAGRA", "magra-lomas", "magra-demo"]) assert.equal(presentaComoDemoGsg(s), true, s);
  for (const s of [null, undefined, "", "beauty-spa", "shinevelas", "quebienoles", "magrita"]) {
    assert.equal(presentaComoDemoGsg(s), false, String(s));
    assert.equal(presentacionDe(s), null);
  }
});

test("magra: marca GSG demo (nombre provisional, cobre), sin relato, piel ni og del cliente", () => {
  const b = brandForSlug("magra");
  assert.equal(b.name, MARCA_DEMO_GSG.nombre);
  assert.equal(b.monogram, "GSG");
  assert.equal(b.preset, "cobre");
  assert.ok(ACCENT_PRESETS.cobre, "el preset cobre existe");
  assert.equal(b.demoGsg, true);
  assert.equal(b.propia, true);
  assert.equal(b.layout, undefined, "sin el layout editorial de Magra");
  assert.notEqual(b.name, "Magra");
  assert.equal(resolveTenantBrandId("magra"), null);
  assert.equal(resolveTenantBrandId("magra-lomas"), null);
  assert.equal(getStorefrontCopy("magra"), null);
  assert.equal(esteticaBackoffice("magra"), null);
  assert.equal(esteticaBackoffice("magra-lomas"), null);
  assert.equal(ogDelNegocio("magra", "magra"), null);
});

test("contacto de la demo: sin datos del cliente, conserva el horario", () => {
  const datos = {
    shortLabel: "Canning", city: "Canning", addressLine: "Calle 123", hoursLabel: "Lun a sáb 9 a 20",
    whatsapp: "+5491100000000", instagram: "@cliente", email: "x@y.z", contactNote: "nota",
  };
  const d = contactoDeLaDemo(datos);
  assert.deepEqual(d, { ...datos, shortLabel: null, city: null, addressLine: null, whatsapp: null, instagram: null, email: null, contactNote: null });
  assert.equal(contactoDeLaDemo(null), null);
});

// NO-CAMBIO CH (regla de la orquestadora: test en cada tanda).
test("CH (beauty-spa) queda idéntico: marca, piel, copy y og", () => {
  assert.deepEqual(brandForSlug("beauty-spa"), {
    name: "CH Estética", monogram: "CH", preset: "petroleo", frontTheme: "light", propia: true,
    layout: { logoPosition: "left", banner: "Reservá online · La Alameda, Canning", hero: "standard" },
  });
  assert.equal(brandForSlug("beauty-spa").demoGsg, undefined);
  assert.equal(esteticaBackoffice("beauty-spa"), "beauty-spa");
  assert.equal(resolveTenantBrandId("beauty-spa"), null);
  assert.equal(presentaComoDemoGsg("beauty-spa"), false);
});

test("las otras marcas editoriales siguen con la suya", () => {
  assert.equal(resolveTenantBrandId("shinevelas"), "shinevelas");
  assert.equal(resolveTenantBrandId("quebienoles"), "quebienoles");
  assert.equal(brandForSlug("shinevelas").name, "Shine");
  assert.equal(brandForSlug("shinevelas").demoGsg, undefined);
});
