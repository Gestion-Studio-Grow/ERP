import { test } from "node:test";
import assert from "node:assert/strict";
import { inicialesDe, pestanaDelPedido, NOMBRE_GSG } from "./pestana";
import { brandForSlug } from "./branding";

test("una dirección sin negocio se presenta como GSG, nunca como un cliente", () => {
  assert.deepEqual(pestanaDelPedido({ sinNegocio: true, brand: brandForSlug("beauty-spa"), nombreDelTenant: "CH" }), { tipo: "gsg", titulo: NOMBRE_GSG });
});

test("con ficha propia: su nombre y su monograma, sin leer el Tenant", () => {
  assert.deepEqual(pestanaDelPedido({ sinNegocio: false, brand: brandForSlug("quebienoles"), nombreDelTenant: null }), {
    tipo: "negocio", titulo: "Qué Bien Olés", glifo: "Q",
  });
});

test("sin ficha: el nombre real del Tenant y sus iniciales (antes «Panel de gestión» para todos)", () => {
  assert.deepEqual(pestanaDelPedido({ sinNegocio: false, brand: brandForSlug("taller-agr"), nombreDelTenant: "Taller Mecánico AGR" }), {
    tipo: "negocio", titulo: "Taller Mecánico AGR", glifo: "TM",
  });
});

test("sin nombre legible: neutro, nunca el de otro negocio", () => {
  for (const nombre of [null, "", "  ", "Mi negocio"]) {
    assert.deepEqual(pestanaDelPedido({ sinNegocio: false, brand: brandForSlug(null), nombreDelTenant: nombre }), {
      tipo: "negocio", titulo: "Panel de gestión", glifo: "•",
    });
  }
});

test("iniciales", () => {
  assert.equal(inicialesDe("Magra"), "M");
  assert.equal(inicialesDe("Velas DEMO"), "VD");
  assert.equal(inicialesDe("   "), "•");
});
