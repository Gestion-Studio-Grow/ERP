import { test } from "node:test";
import assert from "node:assert/strict";
import { TIERS, calcularFactura, creditoImagenRentable } from "./planes.ts";

test("los tres tiers están dentro de la banda US$29–59", () => {
  assert.equal(TIERS.BARRIO.precioMensualUsd, 29);
  assert.equal(TIERS.ACTIVO.precioMensualUsd, 45);
  assert.equal(TIERS.MARCA.precioMensualUsd, 59);
});

test("dentro del tope: no hay excedente y el margen es altísimo (COGS de texto en centavos)", () => {
  const f = calcularFactura("MARCA", 30, 0, 0.4);
  assert.equal(f.excedentePosts, 0);
  assert.equal(f.totalFacturadoUsd, 59);
  assert.ok(f.margenBrutoPct > 0.98);
});

test("pasarse del tope de posteos cobra excedente y sigue siendo rentable", () => {
  // 40 posteos en plan Marca (tope 30) → 10 de excedente a US$1,00 = US$10.
  const f = calcularFactura("MARCA", 40, 0, 0.6);
  assert.equal(f.excedentePosts, 10);
  assert.equal(f.excedentePostsUsd, 10);
  assert.equal(f.totalFacturadoUsd, 69);
  assert.ok(f.margenBrutoUsd > 0, "el excedente nunca deja el margen en rojo");
});

test("el excedente por posteo supera por mucho el COGS de texto por posteo", () => {
  for (const tier of ["BARRIO", "ACTIVO", "MARCA"] as const) {
    // COGS de texto ~US$0,006/post; excedente mínimo US$1,00 → markup > 100x.
    assert.ok(TIERS[tier].excedentePorPostUsd > 0.006 * 20);
  }
});

test("imagen IA: incluidas se respetan y el excedente se cobra por crédito", () => {
  // Plan Marca incluye 10 imágenes; pedimos 14 → 4 de excedente a US$0,35.
  const f = calcularFactura("MARCA", 30, 14, 0.5);
  assert.equal(f.imagenesExcedente, 4);
  assert.equal(Number(f.imagenesExcedenteUsd.toFixed(2)), 1.4);
});

test("el crédito de imagen se vende por encima de su costo (blindaje)", () => {
  for (const tier of ["BARRIO", "ACTIVO", "MARCA"] as const) {
    assert.ok(creditoImagenRentable(tier), `${tier} vende crédito por debajo del costo`);
  }
});

test("un cliente pesado (mucho excedente + muchas imágenes) nunca funde el margen", () => {
  // Peor caso razonable: 60 posteos + 30 imágenes en Barrio, COGS inflado 5x.
  const f = calcularFactura("BARRIO", 60, 30, 0.006 * 60 * 5);
  assert.ok(f.margenBrutoUsd > 0);
  assert.ok(f.margenBrutoPct > 0.5);
});
