import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyCorte,
  groupCortesByCategoria,
  margenCorte,
  CORTE_CATEGORIAS,
} from "./cortes";

test("classifyCorte — cortes de vaca reales de magra", () => {
  assert.equal(classifyCorte("Lomo"), "vaca");
  assert.equal(classifyCorte("Ojo de bife"), "vaca");
  assert.equal(classifyCorte("Bife de chorizo"), "vaca"); // "bife" gana aunque tenga "chorizo"
  assert.equal(classifyCorte("Asado de tira"), "vaca");
  assert.equal(classifyCorte("Vacío"), "vaca");
  assert.equal(classifyCorte("Entraña"), "vaca");
  assert.equal(classifyCorte("Colita de cuadril"), "vaca");
  // "Carne picada" es vacuno, no una tabla de picada gourmet.
  assert.equal(classifyCorte("Carne picada especial"), "vaca");
});

test("classifyCorte — cerdo, pollo, achuras", () => {
  assert.equal(classifyCorte("Bondiola de cerdo"), "cerdo");
  assert.equal(classifyCorte("Solomillo de cerdo"), "cerdo");
  assert.equal(classifyCorte("Pechuga de pollo orgánico"), "pollo");
  assert.equal(classifyCorte("Pollo entero orgánico (~2 kg)"), "pollo");
  // Achuras: taxonomía real de MAGRA en Bistrosoft.
  assert.equal(classifyCorte("Mollejas de corazón"), "achuras");
  assert.equal(classifyCorte("Chinchulines de cordero"), "achuras");
  assert.equal(classifyCorte("Riñón"), "achuras");
});

test("classifyCorte — preparados ganan a la carne cruda", () => {
  // "Milanesas de nalga" contiene "nalga" (vaca) pero es un preparado → preparados.
  assert.equal(classifyCorte("Milanesas de nalga"), "preparados");
  assert.equal(classifyCorte("Hamburguesas caseras (x4)"), "preparados");
  assert.equal(classifyCorte("Chorizo parrillero"), "preparados");
});

test("classifyCorte — gourmet (línea de almacén premium)", () => {
  assert.equal(classifyCorte("Sorrentinos italianos (Lamberti)"), "gourmet");
  assert.equal(classifyCorte("Salsa artesanal importada"), "gourmet");
  assert.equal(classifyCorte("Ensalada premium envasada"), "gourmet");
  assert.equal(classifyCorte("Filet de merluza congelado"), "gourmet");
});

test("classifyCorte — sin match cae en otros", () => {
  assert.equal(classifyCorte("Carbón vegetal 3kg"), "otros");
  assert.equal(classifyCorte(""), "otros");
});

test("groupCortesByCategoria — sólo devuelve categorías no vacías, en orden", () => {
  const cortes = [
    { name: "Lomo" },
    { name: "Bondiola de cerdo" },
    { name: "Sorrentinos italianos" },
    { name: "Asado de tira" },
  ];
  const grupos = groupCortesByCategoria(cortes);
  const ids = grupos.map((g) => g.categoria.id);
  // vaca antes que cerdo antes que gourmet; pollo/preparados/otros ausentes (vacíos).
  assert.deepEqual(ids, ["vaca", "cerdo", "gourmet"]);
  assert.equal(grupos[0].items.length, 2); // Lomo + Asado
});

test("CORTE_CATEGORIAS — góndolas esperadas y únicas", () => {
  const ids = CORTE_CATEGORIAS.map((c) => c.id);
  assert.deepEqual(ids, ["vaca", "cerdo", "pollo", "achuras", "preparados", "gourmet", "otros"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("margenCorte — calcula margen y semáforo", () => {
  // precio 18900/kg, costo 12000 → ganancia 6900, margen 36.5 % → verde.
  const m = margenCorte(18900, 12000);
  assert.ok(m);
  assert.equal(m!.gananciaUnit, 6900);
  assert.ok(Math.abs(m!.pct - 0.365) < 0.001);
  assert.equal(m!.tone, "success");
});

test("margenCorte — semáforo ámbar y rojo", () => {
  assert.equal(margenCorte(10000, 7500)!.tone, "warning"); // 25 %
  assert.equal(margenCorte(10000, 8500)!.tone, "danger"); // 15 %
});

test("margenCorte — sin costo o sin precio → null (no un 0 engañoso)", () => {
  assert.equal(margenCorte(18900, null), null);
  assert.equal(margenCorte(18900, 0), null);
  assert.equal(margenCorte(null, 12000), null);
  assert.equal(margenCorte(0, 12000), null);
});
