// El catálogo del diseño nuevo: se EJECUTA con cortes de MAGRA y velas de Shine tal como están en
// el laboratorio (nombres, precios y stock de `erp_lab`, 25/09/2026) y con URLs sanas, rotas y
// maliciosas.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAMANIO_PAGINA,
  coincideProducto,
  estadoDe,
  hrefAumentarSeleccion,
  leerEditar,
  leerIdsTildados,
  leerParametrosCatalogo,
  margenDe,
  ordenarCatalogo,
  paginaDelCatalogo,
} from "./lista-core";
import type { Corte } from "./CortesSection";

const c = (id: string, name: string, extra: Partial<Corte> = {}): Corte => ({
  id,
  name,
  unit: "kg",
  stock: 10,
  lowStockAt: 5,
  active: true,
  saleUnit: "WEIGHT",
  price: null,
  pricePerKg: null,
  cost: null,
  costoCargado: null,
  category: null,
  trackStock: true,
  ...extra,
});

// MAGRA (erp_lab): precios por kilo y stock reales; el costo de la entraña es de ejemplo.
const MAGRA: Corte[] = [
  c("bife", "Bife de chorizo", { pricePerKg: 28600, stock: 0.847 }),
  c("asado", "Asado de tira", { pricePerKg: 20100, stock: 19.5 }),
  c("bondiola", "Bondiola de cerdo", { pricePerKg: 16900, stock: 5.158 }),
  c("entrana", "Entraña", { pricePerKg: 31300, stock: 4.284, cost: 21000 }),
  c("pechuga", "Pechuga de pollo orgánico", { pricePerKg: 12900, stock: 14.714 }),
  c("hambur", "Hamburguesas caseras (x4)", { saleUnit: "UNIT", unit: "unidad", price: 10900, stock: 21, lowStockAt: 3 }),
];

test("la URL se lee con cuidado: vista y orden que no existen no filtran ni ordenan", () => {
  assert.deepEqual(leerParametrosCatalogo({}), { q: "", vista: null, orden: null, pagina: 1 });
  assert.deepEqual(leerParametrosCatalogo({ q: "  bife ", vista: "stock-bajo", orden: "-precio", cursor: "2" }), {
    q: "bife",
    vista: "stock-bajo",
    orden: { key: "precio", direction: "desc" },
    pagina: 2,
  });
  const raro = leerParametrosCatalogo({ vista: "borrados", orden: "costo", cursor: "-4" });
  assert.equal(raro.vista, null);
  assert.equal(raro.orden, null);
  assert.equal(raro.pagina, 1);
});

test("el cajón de edición sólo se abre con algo que tiene forma de id", () => {
  assert.equal(leerEditar({ editar: "cmg1abc_23-x" }), "cmg1abc_23-x");
  assert.equal(leerEditar({ editar: "a&nuevo=0" }), null);
  assert.equal(leerEditar({ editar: "<script>" }), null);
  assert.equal(leerEditar({}), null);
});

test("buscar «entrana» encuentra «Entraña» (sin tildes ni mayúsculas)", () => {
  assert.equal(coincideProducto(MAGRA[3], "entrana"), true);
  assert.equal(coincideProducto(MAGRA[3], "ENTRAÑA"), true);
  assert.equal(coincideProducto(MAGRA[0], "entrana"), false);
});

test("el estado de cada producto: pausado manda, después sin precio, después stock bajo", () => {
  assert.equal(estadoDe(MAGRA[0]), "stock-bajo"); // 0,847 kg con aviso en 5
  assert.equal(estadoDe(MAGRA[1]), "a-la-venta");
  assert.equal(estadoDe(c("x", "Vacío", { pricePerKg: null })), "sin-precio");
  assert.equal(estadoDe(c("y", "Vacío", { pricePerKg: 22200, active: false, stock: 0 })), "pausado");
  // Sin control de stock no hay «stock bajo» (la misma regla que el Inicio).
  assert.equal(estadoDe(c("z", "Sahumerios", { saleUnit: "UNIT", price: 5900, stock: 0, trackStock: false })), "a-la-venta");
});

test("margen de la entraña: $31.300 el kilo con costo $21.000 deja 32,9 %", () => {
  assert.equal(Math.round((margenDe(MAGRA[3]) ?? 0) * 1000) / 10, 32.9);
  assert.equal(margenDe(MAGRA[0]), null); // sin costo, no hay margen
});

test("sin orden elegido, la carnicería se lee por góndola como el pizarrón: vaca, cerdo, pollo", () => {
  const ids = ordenarCatalogo(MAGRA, null, true).map((x) => x.id);
  assert.ok(ids.indexOf("asado") < ids.indexOf("bondiola"));
  assert.ok(ids.indexOf("bondiola") < ids.indexOf("pechuga"));
  // Fuera de la carnicería, por nombre.
  assert.deepEqual(ordenarCatalogo(MAGRA, null, false).map((x) => x.id).slice(0, 2), ["asado", "bife"]);
});

test("ordenar por precio o margen deja al final los que no tienen el dato, en los dos sentidos", () => {
  const conHueco = [...MAGRA, c("sinp", "Vacío", { pricePerKg: null })];
  const asc = ordenarCatalogo(conHueco, { key: "precio", direction: "asc" }, true).map((x) => x.id);
  const desc = ordenarCatalogo(conHueco, { key: "precio", direction: "desc" }, true).map((x) => x.id);
  assert.equal(asc.at(-1), "sinp");
  assert.equal(desc.at(-1), "sinp");
  assert.equal(desc[0], "entrana");
  assert.equal(ordenarCatalogo(conHueco, { key: "margen", direction: "desc" }, true)[0].id, "entrana");
});

test("la página: vistas con número (búsqueda aplicada), 50 por página y página fuera de rango", () => {
  const velas = Array.from({ length: 73 }, (_, i) =>
    c(`v${i}`, `Vela ${String(i).padStart(2, "0")}`, { saleUnit: "UNIT", unit: "unidad", price: 18300, stock: i % 10, lowStockAt: 3 }),
  );
  const p1 = paginaDelCatalogo(velas, leerParametrosCatalogo({}), false);
  assert.equal(p1.filas.length, TAMANIO_PAGINA);
  assert.equal(p1.paginas, 2);
  assert.equal(p1.porVista["stock-bajo"], 31); // stock 0 a 3 en cada decena: 7 × 4 + (70, 71, 72)
  assert.equal(p1.porVista["sin-costo"], 73);
  const lejos = paginaDelCatalogo(velas, leerParametrosCatalogo({ cursor: "9" }), false);
  assert.equal(lejos.pagina, 2);
  assert.equal(lejos.filas.length, 23);
  const bajo = paginaDelCatalogo(velas, leerParametrosCatalogo({ vista: "stock-bajo", q: "vela 1" }), false);
  assert.equal(bajo.conBusqueda, 10);
  assert.equal(bajo.coinciden, 4);
});

test("«Aumentar precios a la selección» lleva los ids y la pantalla de precios los lee sin basura", () => {
  const href = hrefAumentarSeleccion(["bife", "asado", "x&y=1"]);
  assert.equal(href, "/admin/catalogo/precios?ids=bife,asado");
  assert.deepEqual(leerIdsTildados({ ids: "bife,asado,bife,<b>" }), ["bife", "asado"]);
  assert.deepEqual(leerIdsTildados({}), []);
  assert.equal(leerIdsTildados({ ids: Array.from({ length: 250 }, (_, i) => `p${i}`).join(",") }).length, 200);
});
