// Pruebas de las reglas puras del POS sobre stock: el aviso anticipado de faltante (espejo
// de la guarda anti-oversell del ledger) y el copy del estado vacío de la caja. Sin DB.

import test from "node:test";
import assert from "node:assert/strict";
import { stockShortfall, posEmptyState } from "./pos-stock-rules";

test("un producto que NO controla stock nunca reporta faltante (se vende como siempre)", () => {
  assert.equal(stockShortfall({ stock: 0, trackStock: false }, 50), null);
});

test("un producto desconocido para la caja no bloquea (la guarda real está en el server)", () => {
  assert.equal(stockShortfall(undefined, 3), null);
});

test("con control de stock, alcanza justo o sobra → sin faltante", () => {
  assert.equal(stockShortfall({ stock: 5, trackStock: true }, 5), null);
  assert.equal(stockShortfall({ stock: 5, trackStock: true }, 2), null);
});

test("con control de stock, pedir más de lo que hay → faltante con lo disponible", () => {
  assert.deepEqual(stockShortfall({ stock: 5, trackStock: true }, 6), { available: 5 });
});

test("el stock negativo heredado se informa como 0 disponible, no como negativo", () => {
  assert.deepEqual(stockShortfall({ stock: -2, trackStock: true }, 1), { available: 0 });
});

test("cantidad cero o inválida no es faltante (todavía no hay línea que vender)", () => {
  assert.equal(stockShortfall({ stock: 0, trackStock: true }, 0), null);
  assert.equal(stockShortfall({ stock: 0, trackStock: true }, Number.NaN), null);
});

test("soporta fracciones (venta por kg): 1.250 kg con 1.2 en stock falta", () => {
  assert.deepEqual(stockShortfall({ stock: 1.2, trackStock: true }, 1.25), { available: 1.2 });
  assert.equal(stockShortfall({ stock: 1.25, trackStock: true }, 1.25), null);
});

test("estado vacío sin productos, quien mira puede editar el catálogo → lo manda a cargar", () => {
  const s = posEmptyState({ activeProducts: 0, canManageCatalog: true });
  assert.equal(s.title, "Todavía no hay productos para vender");
  assert.match(s.description, /catálogo/);
  assert.equal(s.linkToCatalog, true);
});

test("estado vacío con productos sin precio → dice cuántos y qué falta", () => {
  const s = posEmptyState({ activeProducts: 3, canManageCatalog: true });
  assert.equal(s.title, "Hay 3 productos en el catálogo, pero ninguno tiene precio de venta");
  assert.match(s.description, /precio de venta/);
  assert.equal(s.linkToCatalog, true);
});

test("estado vacío con un solo producto concuerda en singular", () => {
  const s = posEmptyState({ activeProducts: 1, canManageCatalog: true });
  assert.equal(s.title, "Hay 1 producto en el catálogo, pero ninguno tiene precio de venta");
});

test("quien NO puede editar el catálogo recibe a quién pedírselo y sin botón al catálogo", () => {
  const sin = posEmptyState({ activeProducts: 0, canManageCatalog: false });
  assert.match(sin.description, /Pedile a quien administra el catálogo/);
  assert.equal(sin.linkToCatalog, false);
  const con = posEmptyState({ activeProducts: 4, canManageCatalog: false });
  assert.match(con.description, /Pedile a quien administra el catálogo/);
  assert.equal(con.linkToCatalog, false);
});

test("el copy es neutral de rubro: sin cortes, góndolas ni balanza", () => {
  for (const s of [
    posEmptyState({ activeProducts: 0, canManageCatalog: true }),
    posEmptyState({ activeProducts: 2, canManageCatalog: true }),
    posEmptyState({ activeProducts: 2, canManageCatalog: false }),
  ]) {
    assert.doesNotMatch(`${s.title} ${s.description}`, /corte|góndola|balanza|pesalo/i);
  }
});
