// Stock del diseño nuevo: se EJECUTA con productos de MAGRA y de Shine tal como están en el
// laboratorio (nombre, stock y mínimo de `erp_lab`, 25/09/2026). Los costos y el producto en
// negativo son armados para el test (en el laboratorio hoy no hay ninguno en negativo).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { InventoryRow } from "@/lib/inventario/valuation";
import {
  TAMANIO_PAGINA_STOCK,
  aFilaDeStock,
  estadoDeStock,
  hrefContar,
  leerParametrosStock,
  ordenarStock,
  paginaDeStock,
  unidadCorta,
  type FilaDeStock,
} from "./stock-core";

function fila(name: string, stock: number, unit: string, extra: Partial<InventoryRow> = {}): InventoryRow {
  return {
    productId: name.toLowerCase().replace(/[^a-z]+/g, "-"),
    name,
    unit,
    stock,
    unitCost: 0,
    valuation: 0,
    belowLowStock: false,
    negative: false,
    sinCosto: true,
    ...extra,
  };
}

// MAGRA (erp_lab): Bife de chorizo 0,847 kg (mín. 5), Cuadril 3,8 kg (mín. 5), Bondiola 5,158 kg (mín. 5).
const bife = fila("Bife de chorizo", 0.847, "kg", { belowLowStock: true, unitCost: 17200, valuation: 14568, sinCosto: false });
const cuadril = fila("Cuadril", 3.8, "kg", { belowLowStock: true, unitCost: 15100, valuation: 57380, sinCosto: false });
const bondiola = fila("Bondiola de cerdo", 5.158, "kg", { unitCost: 9800, valuation: 50548, sinCosto: false });
const pollo = fila("Pollo entero orgánico (~2 kg)", 4, "u");
const vacio = fila("Vacío", -1.2, "kg", { negative: true, belowLowStock: true, unitCost: 14000, valuation: -16800, sinCosto: false });

const magra = [bondiola, pollo, cuadril, vacio, bife].map((r) => aFilaDeStock(r, null, true));

test("lo que está mal va primero: en negativo, después bajo el mínimo, después la góndola", () => {
  const nombres = ordenarStock(magra, null).map((f) => f.name);
  assert.deepEqual(nombres, ["Vacío", "Bife de chorizo", "Cuadril", "Bondiola de cerdo", "Pollo entero orgánico (~2 kg)"]);
});

test("en velas no hay góndola: el resto va por nombre", () => {
  const shine = [
    fila("Vela Vainilla y Canela", 5, "u"),
    fila("Florero de vidrio soplado", 0, "u", { belowLowStock: true }),
    fila("Difusor Jazmín", 3, "u", { belowLowStock: true }),
    fila("Bandeja deco de madera", 4, "u"),
  ].map((r) => aFilaDeStock(r, null, false));
  assert.equal(shine[0].gondola, null);
  assert.deepEqual(
    ordenarStock(shine, null).map((f) => f.name),
    ["Difusor Jazmín", "Florero de vidrio soplado", "Bandeja deco de madera", "Vela Vainilla y Canela"],
  );
});

test("un estado por fila, del más urgente al normal; «sin costo» sólo para quien ve costos", () => {
  assert.equal(estadoDeStock(vacio, true), "negativo");
  assert.equal(estadoDeStock(bife, true), "stock-bajo");
  assert.equal(estadoDeStock(pollo, true), "sin-costo");
  assert.equal(estadoDeStock(pollo, false), "en-orden");
  assert.equal(estadoDeStock(bondiola, true), "en-orden");
  // Sin stock no hay nada que valuar: no se marca «sin costo».
  assert.equal(estadoDeStock(fila("Florero de vidrio soplado", 0, "u"), true), "en-orden");
});

test("el mínimo sólo se muestra si la fila lo trae; nunca se inventa", () => {
  assert.equal(aFilaDeStock(bife, null, true).minimo, null);
  const conMinimo = { ...bife, lowStockAt: 5 } as InventoryRow;
  assert.equal(aFilaDeStock(conMinimo, null, true).minimo, 5);
  const roto = { ...bife, lowStockAt: "5" } as unknown as InventoryRow;
  assert.equal(aFilaDeStock(roto, null, true).minimo, null);
});

test("la góndola explícita manda sobre la que se deduce del nombre", () => {
  assert.equal(aFilaDeStock(bondiola, null, true).gondola, "cerdo");
  assert.equal(aFilaDeStock(bondiola, "achuras", true).gondola, "achuras");
  assert.equal(aFilaDeStock(bondiola, "cualquiera", true).gondola, "cerdo");
});

test("URL: lo que no se entiende se ignora; quien no ve costos no pide «sin costo» ni «valor»", () => {
  assert.deepEqual(leerParametrosStock({}, true), { q: "", vista: null, orden: null, pagina: 1 });
  const p = leerParametrosStock({ q: "  bife ", vista: "stock-bajo", orden: "-stock", cursor: "2" }, true);
  assert.equal(p.q, "bife");
  assert.equal(p.vista, "stock-bajo");
  assert.deepEqual(p.orden, { key: "stock", direction: "desc" });
  assert.equal(p.pagina, 2);
  assert.equal(leerParametrosStock({ vista: "sin-costo" }, false).vista, null);
  assert.equal(leerParametrosStock({ orden: "valor" }, false).orden, null);
  assert.equal(leerParametrosStock({ vista: "<script>", cursor: "-3" }, true).vista, null);
  assert.equal(leerParametrosStock({ cursor: "-3" }, true).pagina, 1);
  assert.equal(leerParametrosStock({ q: "x".repeat(300) }, true).q.length, 80);
});

test("chips: cuentan con la búsqueda aplicada; la página se corta en el servidor", () => {
  const pag = paginaDeStock(magra, { q: "", vista: "stock-bajo", orden: null, pagina: 1 });
  assert.equal(pag.coinciden, 3);
  assert.deepEqual(pag.porVista, { negativo: 1, "stock-bajo": 3, "sin-costo": 1 });
  assert.equal(pag.conBusqueda, 5);
  const buscando = paginaDeStock(magra, { q: "BIFE", vista: null, orden: null, pagina: 9 });
  assert.equal(buscando.coinciden, 1);
  assert.equal(buscando.pagina, 1, "una página que no existe cae en la última");

  const muchas: FilaDeStock[] = Array.from({ length: TAMANIO_PAGINA_STOCK + 7 }, (_, i) =>
    aFilaDeStock(fila(`Vela ${String(i).padStart(3, "0")}`, 5, "u"), null, false),
  );
  const segunda = paginaDeStock(muchas, { q: "", vista: null, orden: null, pagina: 2 });
  assert.equal(segunda.paginas, 2);
  assert.equal(segunda.filas.length, 7);
  assert.equal(segunda.filas[0].name, `Vela ${String(TAMANIO_PAGINA_STOCK).padStart(3, "0")}`);
});

test("ordenar por valor: lo que no tiene costo va al final en los dos sentidos", () => {
  const asc = ordenarStock(magra, { key: "valor", direction: "asc" }).map((f) => f.name);
  const desc = ordenarStock(magra, { key: "valor", direction: "desc" }).map((f) => f.name);
  assert.equal(asc.at(-1), "Pollo entero orgánico (~2 kg)");
  assert.equal(desc.at(-1), "Pollo entero orgánico (~2 kg)");
  assert.equal(desc[0], "Cuadril");
});

test("«Contar» lleva al recuento con el producto; sin esa app, a ajustes con motivo recuento", () => {
  assert.equal(hrefContar("p1", { recontar: true, mermas: true }), "/admin/ajustes/recuento?producto=p1");
  assert.equal(hrefContar("p1", { recontar: false, mermas: true }), "/admin/ajustes?producto=p1&motivo=RECUENTO");
  assert.equal(hrefContar("p1", { recontar: false, mermas: false }), null);
});

test("la unidad se lee corta: «5 u», no «5 unidad» (Canning trae la palabra entera)", () => {
  assert.equal(unidadCorta("unidad"), "u");
  assert.equal(unidadCorta("Unidades"), "u");
  assert.equal(unidadCorta("kg"), "kg");
  assert.equal(unidadCorta("u"), "u");
  assert.equal(unidadCorta("docena"), "docena");
  assert.equal(unidadCorta(" "), "u");
});
