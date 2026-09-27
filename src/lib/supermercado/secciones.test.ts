import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_SUPERMERCADO } from "@/blueprints/retail/supermercado-catalogo";
import { seccionDe, seccionPorNombre } from "./secciones";

test("el nombre de cada producto del catálogo semilla da su sección (sin la columna de góndola)", () => {
  const mal = CATALOGO_SUPERMERCADO.filter(
    (p) => seccionPorNombre({ name: p.name, saleUnit: p.sale === "kg" ? "WEIGHT" : "UNIT" }) !== p.seccion,
  ).map((p) => `${p.name}: ${seccionPorNombre({ name: p.name, saleUnit: p.sale === "kg" ? "WEIGHT" : "UNIT" })} ≠ ${p.seccion}`);
  assert.deepEqual(mal, []);
});

test("lo que parece de otra sección cae donde va: chocolate con leche en almacén, té helado en bebidas", () => {
  assert.equal(seccionPorNombre({ name: "Chocolate con leche 100 g", saleUnit: "UNIT" }), "almacen");
  assert.equal(seccionPorNombre({ name: "Té helado de durazno 500 ml", saleUnit: "UNIT" }), "bebidas");
  assert.equal(seccionPorNombre({ name: "Postre helado de chocolate", saleUnit: "UNIT" }), "congelados");
  assert.equal(seccionPorNombre({ name: "Desodorante de ambiente lavanda", saleUnit: "UNIT" }), "limpieza");
  assert.equal(seccionPorNombre({ name: "Desodorante roll-on 50 ml", saleUnit: "UNIT" }), "perfumeria");
  assert.equal(seccionPorNombre({ name: "Pan rallado 1 kg", saleUnit: "UNIT" }), "almacen");
  assert.equal(seccionPorNombre({ name: "Pan lactal de salvado", saleUnit: "UNIT" }), "panaderia");
});

test("por peso sólo hay secciones con balanza; lo que no se reconoce es verdulería", () => {
  assert.equal(seccionPorNombre({ name: "Queso cremoso", saleUnit: "WEIGHT" }), "fiambreria");
  assert.equal(seccionPorNombre({ name: "Bondiola curada", saleUnit: "WEIGHT" }), "fiambreria");
  assert.equal(seccionPorNombre({ name: "Bondiola de cerdo", saleUnit: "WEIGHT" }), "carniceria");
  assert.equal(seccionPorNombre({ name: "Pan francés", saleUnit: "WEIGHT" }), "panaderia");
  assert.equal(seccionPorNombre({ name: "Zapallito verde", saleUnit: "WEIGHT" }), "verduleria");
});

test("un producto que no se reconoce por unidad cae en almacén", () => {
  assert.equal(seccionPorNombre({ name: "Artículo sin pistas", saleUnit: "UNIT" }), "almacen");
});

test("la sección explícita manda si es una del súper; una que no es del súper se ignora", () => {
  assert.equal(seccionDe({ name: "Chocolate con leche", saleUnit: "UNIT", category: "bebidas" }), "bebidas");
  assert.equal(seccionDe({ name: "Chocolate con leche", saleUnit: "UNIT", category: "vaca" }), "almacen");
  assert.equal(seccionDe({ name: "Chocolate con leche", saleUnit: "UNIT", category: null }), "almacen");
});
