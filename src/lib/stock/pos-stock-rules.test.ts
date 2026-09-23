// Pruebas de las reglas puras del POS sobre stock: el aviso anticipado de faltante (espejo
// de la guarda anti-oversell del ledger) y el copy del estado vacío de la caja. Sin DB.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  stockShortfall,
  posEmptyState,
  permiteVenderSinStock,
  productosQuePuedenQuedarNegativos,
  faltanteDeLinea,
  type ContextoDeStock,
} from "./pos-stock-rules";

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

// ── MAG-4: cuándo el faltante avisa en vez de bloquear ──────────────────────

test("la matriz UNIT/WEIGHT × COUNTER/ONLINE: sólo WEIGHT + COUNTER permite negativo", () => {
  const casos: [string, ContextoDeStock, boolean][] = [
    ["UNIT", "COUNTER", false],
    ["UNIT", "ONLINE", false],
    ["WEIGHT", "COUNTER", true],
    ["WEIGHT", "ONLINE", false],
  ];
  for (const [saleUnit, contexto, esperado] of casos) {
    assert.equal(permiteVenderSinStock({ saleUnit, contexto }), esperado, `${saleUnit} + ${contexto}`);
  }
});

test("al editar un pedido al peso real: WEIGHT sí, UNIT no", () => {
  assert.equal(permiteVenderSinStock({ saleUnit: "WEIGHT", contexto: "EDICION_PESO_REAL" }), true);
  assert.equal(permiteVenderSinStock({ saleUnit: "UNIT", contexto: "EDICION_PESO_REAL" }), false);
});

test("una unidad de venta desconocida no abre la excepción", () => {
  assert.equal(permiteVenderSinStock({ saleUnit: "", contexto: "COUNTER" }), false);
  assert.equal(permiteVenderSinStock({ saleUnit: "weight", contexto: "COUNTER" }), false);
});

test("la lista que viaja a insertOrder: sólo los productos por peso, y sólo en mostrador", () => {
  const prods = [
    { id: "vacio", saleUnit: "WEIGHT" },
    { id: "chorizo-u", saleUnit: "UNIT" },
    { id: "bife", saleUnit: "WEIGHT" },
  ];
  assert.deepEqual(productosQuePuedenQuedarNegativos(prods, "COUNTER"), ["vacio", "bife"]);
  assert.deepEqual(productosQuePuedenQuedarNegativos(prods, "ONLINE"), []);
});

test("el caso del sábado: stock 1,1 kg, se vende 1,240 en mostrador → avisa, no bloquea", () => {
  const r = faltanteDeLinea({ stock: 1.1, trackStock: true }, 1.24, { saleUnit: "WEIGHT", contexto: "COUNTER" });
  assert.deepEqual(r, {
    bloquea: false,
    available: 1.1,
    quedaria: -0.14,
    aviso: "El sistema tenía 1,1 kg; se vende igual y queda en −0,14 kg. Recontalo en Inventario.",
  });
});

test("el mismo 1,240 kg en un pedido online sigue bloqueando", () => {
  assert.deepEqual(
    faltanteDeLinea({ stock: 1.1, trackStock: true }, 1.24, { saleUnit: "WEIGHT", contexto: "ONLINE" }),
    { bloquea: true, available: 1.1 },
  );
});

test("un producto por unidad sin stock sigue bloqueado en el mostrador", () => {
  assert.deepEqual(
    faltanteDeLinea({ stock: 0, trackStock: true }, 1, { saleUnit: "UNIT", contexto: "COUNTER" }),
    { bloquea: true, available: 0 },
  );
});

test("si alcanza, o el producto no controla stock, no hay nada que decir", () => {
  const w = { saleUnit: "WEIGHT", contexto: "COUNTER" } as const;
  assert.equal(faltanteDeLinea({ stock: 2, trackStock: true }, 1.24, w), null);
  assert.equal(faltanteDeLinea({ stock: 0, trackStock: false }, 1.24, w), null);
  assert.equal(faltanteDeLinea(undefined, 1.24, w), null);
});

test("con el stock ya en negativo, el aviso dice lo que había (negativo) y lo que queda", () => {
  const r = faltanteDeLinea({ stock: -0.14, trackStock: true }, 0.5, { saleUnit: "WEIGHT", contexto: "COUNTER" });
  assert.ok(r && !r.bloquea);
  if (r && !r.bloquea) {
    assert.equal(r.quedaria, -0.64);
    assert.match(r.aviso, /tenía −0,14 kg; se vende igual y queda en −0,64 kg/);
  }
});

// ── Forma: la decisión la toman los llamadores, insertOrder sólo la ejecuta ──
//
// No hay base para ejecutar createOrder/insertOrder. Lo que sí se asegura: que el núcleo
// compartido con la vidriera y la ingesta externa no infiere la excepción, y que los dos
// llamadores que la merecen la calculan con la regla de arriba.

// Se miran sólo las líneas de CÓDIGO: los comentarios nombran la regla para explicar por qué
// NO se llama en tal lado, y eso no puede contar como llamarla.
function soloCodigo(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/\s.*$/gm, "");
}

const orderCore = soloCodigo(readFileSync(new URL("../order-core.ts", import.meta.url), "utf8"));
const orderActions = soloCodigo(readFileSync(new URL("../order-actions.ts", import.meta.url), "utf8"));

function cuerpoDe(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.ok(i >= 0, `no encontré «${firma}»`);
  const fin = src.indexOf("\n}\n", i);
  return src.slice(i, fin === -1 ? undefined : fin);
}

test("insertOrder no decide la excepción: no importa la regla ni mira saleUnit para el stock", () => {
  assert.doesNotMatch(orderCore, /pos-stock-rules|permiteVenderSinStock|productosQuePuedenQuedarNegativos/);
  const cuerpo = cuerpoDe(orderCore, "export async function insertOrder(");
  assert.match(cuerpo, /allowNegative:\s*negativoPermitido\.has\(l\.productId\)/);
  assert.match(cuerpo, /opts\?\.permitirNegativoPorProducto/);
});

test("createOrder calcula la lista con la regla; la vidriera no la pasa", () => {
  assert.match(cuerpoDe(orderActions, "export async function createOrder("), /productosQuePuedenQuedarNegativos\(/);
  assert.doesNotMatch(cuerpoDe(orderActions, "export async function placeOnlineOrder("), /permitirNegativoPorProducto/);
  const externa = soloCodigo(readFileSync(new URL("../external-orders.ts", import.meta.url), "utf8"));
  assert.doesNotMatch(externa, /permitirNegativoPorProducto|allowNegative/);
});

test("updateOrderItems usa la regla con el contexto de edición al peso real", () => {
  const cuerpo = cuerpoDe(orderActions, "export async function updateOrderItems(");
  assert.match(cuerpo, /permiteVenderSinStock\(\{[^}]*contexto:\s*"EDICION_PESO_REAL"/);
});
