// El catálogo de servicios (CH) con «Diseño nuevo»: la pestaña pedida y lo que cuenta la línea de estado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { contarCatalogo, leerParte } from "./catalogo-servicios-core";

test("sin ?ver= o con una pestaña que no existe, abre Servicios", () => {
  assert.equal(leerParte({}), "servicios");
  assert.equal(leerParte({ ver: "cualquiera" }), "servicios");
  assert.equal(leerParte({ ver: ["boxes", "cupones"] }), "servicios");
});

test("cada pestaña del catálogo se abre por su nombre", () => {
  for (const v of ["profesionales", "boxes", "equipos", "productos", "quien", "cupones"]) assert.equal(leerParte({ ver: v }), v);
});

const servicios = [
  { id: "limpieza", active: true, categoryId: "faciales" },
  { id: "peeling", active: true, categoryId: "faciales" },
  { id: "maderoterapia", active: true, categoryId: null },
  { id: "pausado", active: false, categoryId: null },
];

test("un servicio que sólo hace una profesional pausada cuenta como sin profesional", () => {
  const c = contarCatalogo(servicios, [
    { name: "Valentina Ríos", active: true, boxId: "box1", services: [{ id: "limpieza" }] },
    { name: "Sol Díaz", active: false, boxId: "box2", services: [{ id: "peeling" }, { id: "limpieza" }] },
  ]);
  assert.equal(c.quienesLaHacen.limpieza, 1);
  assert.equal(c.quienesLaHacen.peeling, undefined);
  assert.equal(c.sinProfesional, 2); // peeling y maderoterapia; el pausado no se cuenta
  assert.equal(c.profesionalesActivos, 1);
});

test("los sin categoría y los a la venta cuentan sólo los servicios activos", () => {
  const c = contarCatalogo(servicios, []);
  assert.equal(c.aLaVenta, 3);
  assert.equal(c.sinCategoria, 1);
});

test("cada box lista sus profesionales activos; el que no tiene box no aparece", () => {
  const c = contarCatalogo(servicios, [
    { name: "Valentina Ríos", active: true, boxId: "box1", services: [] },
    { name: "Rocío Paz", active: true, boxId: "box1", services: [] },
    { name: "Sol Díaz", active: false, boxId: "box2", services: [] },
    { name: "Mica Luna", active: true, boxId: null, services: [] },
  ]);
  assert.deepEqual(c.profesionalesPorBox, { box1: ["Valentina Ríos", "Rocío Paz"] });
});
