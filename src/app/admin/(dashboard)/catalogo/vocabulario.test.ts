// Las palabras y la forma de venta del alta del catálogo de mostrador, con los rubros reales.

import { test } from "node:test";
import assert from "node:assert/strict";
import { RETAIL_RUBROS, getRetailRubro } from "@/blueprints/retail/rubros";
import { VOCABULARIO_CARNICERIA, vocabularioDelRubro } from "./vocabulario";

test("la carnicería (MAGRA) queda como estaba: 'corte', por kilo, con los textos de carne", () => {
  assert.deepEqual(vocabularioDelRubro(getRetailRubro("carniceria")), VOCABULARIO_CARNICERIA);
  // Sin rubro resuelto, lo de siempre.
  assert.deepEqual(vocabularioDelRubro(null), VOCABULARIO_CARNICERIA);
});

test("velas y pádel: 'producto', por unidad, sin los textos de carne", () => {
  for (const id of ["velas", "padel"]) {
    const v = vocabularioDelRubro(getRetailRubro(id));
    assert.deepEqual(v, { uno: "producto", varios: "productos", carniceria: false, porPeso: false }, id);
  }
});

test("el alta arranca por kilo en los rubros que venden por peso y por unidad en los demás", () => {
  // Los rubros reales, con lo que se espera de cada uno escrito a mano (no la regla repetida).
  const porKilo = new Set(Object.values(RETAIL_RUBROS).filter((r) => vocabularioDelRubro(r).porPeso).map((r) => r.id));
  for (const id of ["carniceria", "verduleria"]) assert.ok(porKilo.has(id), `${id} vende por peso`);
  for (const id of ["velas", "padel", "indumentaria"]) assert.ok(!porKilo.has(id), `${id} vende por unidad`);
  assert.equal(vocabularioDelRubro(getRetailRubro("indumentaria")).uno, "prenda");
  assert.equal(vocabularioDelRubro(getRetailRubro("indumentaria")).varios, "prendas");
});
