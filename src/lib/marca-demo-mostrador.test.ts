// DEMO GSG · T2: la vidriera y el mostrador de Magra no muestran nombre ni contacto del cliente; CH (beauty-spa), igual.
// Corre: node --import tsx --test src/lib/marca-demo-mostrador.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARCA_DEMO_GSG, contactoVisibleDelNegocio, nombreVisibleDelNegocio } from "./marca-demo";
import { editorialFrontFor } from "./identidad-rubro";
import { resolveTenantBrandId } from "@/tenants/storefront";
import { marcaDeLaVidriera } from "@/app/tienda/vidriera/marcas";

test("nombre visible: magra y sus locales → nombre de la demo, aunque la fila diga «Magra»", () => {
  for (const s of ["magra", "magra-lomas", "MAGRA"]) {
    assert.equal(nombreVisibleDelNegocio(s, "Magra", "Mi negocio"), MARCA_DEMO_GSG.nombre, s);
    assert.equal(nombreVisibleDelNegocio(s, null, "el local"), MARCA_DEMO_GSG.nombre, s);
  }
});

test("nombre visible: CH (beauty-spa) y el resto, byte-idénticos a antes (`name ?? reemplazo`)", () => {
  assert.equal(nombreVisibleDelNegocio("beauty-spa", "CH Estética", "Mi negocio"), "CH Estética");
  assert.equal(nombreVisibleDelNegocio("beauty-spa", null, "Mi negocio"), "Mi negocio");
  assert.equal(nombreVisibleDelNegocio("beauty-spa", "", "el local"), "el local");
  assert.equal(nombreVisibleDelNegocio(null, undefined, "el local"), "el local");
  assert.equal(nombreVisibleDelNegocio("shinevelas", "Shine", "x"), "Shine");
});

test("contacto visible: la demo no muestra la dirección del local; CH sí", () => {
  assert.equal(contactoVisibleDelNegocio("magra", "Av. Siempreviva 742"), null);
  assert.equal(contactoVisibleDelNegocio("beauty-spa", "Av. Siempreviva 742"), "Av. Siempreviva 742");
  assert.equal(contactoVisibleDelNegocio("beauty-spa", null), null);
});

test("vidriera: la demo no entra al front ni a la rama «magra» de la vidriera nueva (sin MAGRA, su copy ni su WhatsApp)", () => {
  for (const s of ["magra", "magra-lomas"]) {
    const brandId = resolveTenantBrandId(s);
    const front = editorialFrontFor({ brandId });
    assert.equal(front, null, s);
    assert.equal(marcaDeLaVidriera(front, brandId), "generica", s);
  }
  // CH: sin front editorial, igual que antes.
  const ch = resolveTenantBrandId("beauty-spa");
  assert.equal(editorialFrontFor({ brandId: ch }), null);
  assert.equal(marcaDeLaVidriera(null, ch), "generica");
});

test("mostrador y pedidos: cada lector del nombre del negocio pasa por nombreVisibleDelNegocio", () => {
  const raiz = join(process.cwd(), "src");
  for (const f of [
    "app/admin/(dashboard)/vender/datos.ts",
    "app/admin/(dashboard)/vender/boutique/cargar.ts",
    "app/admin/(dashboard)/ventas/page.tsx",
    "app/admin/(dashboard)/caja-rapida/page.tsx",
    "app/admin/(dashboard)/pedidos/reparto/datos.server.ts",
    "app/admin/(dashboard)/pedidos/[code]/armar/acciones.ts",
    "lib/cobros-actions.ts",
    "app/admin/(dashboard)/catalogo/etiquetas/page.tsx",
    "app/admin/(dashboard)/cierre-mes/paquete/route.ts",
    "lib/suppliers/sugerido-loader.ts",
  ]) {
    const src = readFileSync(join(raiz, f), "utf8");
    assert.match(src, /nombreVisibleDelNegocio\(tenant\??\.slug, tenant\??\.name/, f);
    assert.doesNotMatch(src, /tenant\??\.name \?\? "(Mi negocio|el local)"/, f);
    assert.doesNotMatch(src, /tenant\.name \|\| "el local"/, f);
  }
});
