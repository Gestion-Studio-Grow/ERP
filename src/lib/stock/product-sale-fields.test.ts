// Pruebas del parseo de los campos de VENTA del producto (precio por unidad / por kg,
// forma de venta, control de stock) desde el FormData del catálogo. Sin DB.
//
// El bug que cierra: el alta de producto no tenía campo de precio, así que todo producto
// cargado desde la aplicación quedaba a $0 en la caja y sólo se podía vender después de un
// UPDATE por SQL. Acá se fija el contrato de lo que la action guarda.

import test from "node:test";
import assert from "node:assert/strict";
import { parseSaleFields, salePriceOf } from "./product-sale-fields";

function form(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

test("un form sin campos de venta no toca nada (compatibilidad con ABMs parciales)", () => {
  assert.deepEqual(parseSaleFields(form({ name: "Guantes", stock: "10" })), {});
});

test("venta por unidad: guarda price y anula pricePerKg", () => {
  const out = parseSaleFields(form({ saleUnit: "UNIT", price: "32000" }));
  assert.deepEqual(out, { saleUnit: "UNIT", price: 32000, pricePerKg: null });
});

test("venta por peso: guarda pricePerKg y anula price", () => {
  const out = parseSaleFields(form({ saleUnit: "WEIGHT", pricePerKg: "9500" }));
  assert.deepEqual(out, { saleUnit: "WEIGHT", price: null, pricePerKg: 9500 });
});

test("el precio que NO corresponde a la forma de venta se descarta aunque venga en el form", () => {
  // Un form que manda los dos campos (p.ej. cambió de modo y quedó el otro input con valor)
  // no puede dejar el producto incoherente: saleUnit=UNIT con sólo pricePerKg era $0 en caja.
  const unit = parseSaleFields(form({ saleUnit: "UNIT", price: "100", pricePerKg: "9500" }));
  assert.equal(unit.price, 100);
  assert.equal(unit.pricePerKg, null);
  const weight = parseSaleFields(form({ saleUnit: "WEIGHT", price: "100", pricePerKg: "9500" }));
  assert.equal(weight.price, null);
  assert.equal(weight.pricePerKg, 9500);
});

test("precio vacío = null (insumo que no se vende), no 0 ni NaN", () => {
  const out = parseSaleFields(form({ saleUnit: "UNIT", price: "" }));
  assert.equal(out.price, null);
});

test("precio cero, negativo o basura se guarda como null", () => {
  assert.equal(parseSaleFields(form({ saleUnit: "UNIT", price: "0" })).price, null);
  assert.equal(parseSaleFields(form({ saleUnit: "UNIT", price: "-5" })).price, null);
  assert.equal(parseSaleFields(form({ saleUnit: "UNIT", price: "abc" })).price, null);
  assert.equal(parseSaleFields(form({ saleUnit: "WEIGHT", pricePerKg: "Infinity" })).pricePerKg, null);
});

test("una forma de venta desconocida cae a UNIT (fail-safe)", () => {
  assert.equal(parseSaleFields(form({ saleUnit: "DOCENA", price: "10" })).saleUnit, "UNIT");
});

test("acepta decimales en el precio (kg fraccionado, centavos)", () => {
  assert.equal(parseSaleFields(form({ saleUnit: "WEIGHT", pricePerKg: "9500.50" })).pricePerKg, 9500.5);
});

test("trackStock ausente → no se toca (un form viejo no apaga el control de stock)", () => {
  const out = parseSaleFields(form({ saleUnit: "UNIT", price: "10" }));
  assert.equal("trackStock" in out, false);
});

test("trackStock: hidden 'off' + checkbox 'on' → true; sólo el hidden 'off' → false", () => {
  assert.equal(parseSaleFields(form({ trackStock: ["off", "on"] })).trackStock, true);
  assert.equal(parseSaleFields(form({ trackStock: "off" })).trackStock, false);
  assert.equal(parseSaleFields(form({ trackStock: "true" })).trackStock, true);
});

test("trackStock se puede mandar solo, sin los campos de precio", () => {
  assert.deepEqual(parseSaleFields(form({ trackStock: ["off", "on"] })), { trackStock: true });
});

test("salePriceOf devuelve el precio que corresponde a la forma de venta, o null", () => {
  assert.equal(salePriceOf({ saleUnit: "UNIT", price: 100, pricePerKg: 9000 }), 100);
  assert.equal(salePriceOf({ saleUnit: "WEIGHT", price: 100, pricePerKg: 9000 }), 9000);
  assert.equal(salePriceOf({ saleUnit: "UNIT", price: null, pricePerKg: 9000 }), null);
  assert.equal(salePriceOf({ saleUnit: "WEIGHT", price: 100, pricePerKg: null }), null);
  assert.equal(salePriceOf({ saleUnit: "UNIT", price: 0, pricePerKg: null }), null);
});
