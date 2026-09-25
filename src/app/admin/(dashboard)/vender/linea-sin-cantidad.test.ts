// La línea con producto y SIN cantidad: la regla que frena el cobro en las tres pantallas de venta
// (Vender con la vista de siempre, Vender con «Diseño nuevo» y el POS de la bandeja). Sin ella, esa
// línea no viaja al servidor y el ticket sale sin ella, cobrado de menos y sin que nadie lo note.

import { test } from "node:test";
import assert from "node:assert/strict";
import { lineaSinCantidad, motivoDeLineaSinCantidad } from "./reglas-venta";

const l = (productId: string, qty: number, invalida = false) => ({ productId, qty, invalida });

test("una línea con producto y cantidad vacía (0) es la que falta", () => {
  const vacio = l("p_vacio", 1.24);
  const crema = l("p_crema", 0);
  assert.equal(lineaSinCantidad([vacio, crema]), crema);
});

test("la línea en blanco (sin producto) no frena: es el renglón para el próximo producto", () => {
  assert.equal(lineaSinCantidad([l("p_vacio", 1), l("", 0)]), undefined);
});

test("una cantidad ilegible no se cuenta acá: tiene su propio aviso («cantidad inválida»)", () => {
  assert.equal(lineaSinCantidad([l("p_vacio", 0, true)]), undefined);
});

test("cantidad negativa o no numérica tampoco viaja: frena igual que la vacía", () => {
  assert.equal(lineaSinCantidad([l("p_vacio", -1)])?.productId, "p_vacio");
  assert.equal(lineaSinCantidad([l("p_vacio", Number.NaN)])?.productId, "p_vacio");
});

test("devuelve la PRIMERA que falta, en el orden del ticket", () => {
  assert.equal(lineaSinCantidad([l("a", 1), l("b", 0), l("c", 0)])?.productId, "b");
});

test("todas con cantidad: no hay nada que frenar", () => {
  assert.equal(lineaSinCantidad([l("a", 1), l("b", 0.5)]), undefined);
  assert.equal(lineaSinCantidad([]), undefined);
});

test("el motivo usa la palabra de la balanza para lo que va por kilo y dice cuál", () => {
  assert.equal(motivoDeLineaSinCantidad({ name: "Vacío", saleUnit: "WEIGHT" }), "Falta el peso de Vacío");
  assert.equal(motivoDeLineaSinCantidad({ name: "Crema", saleUnit: "UNIT" }), "Falta la cantidad de Crema");
});

test("sin el producto a mano (salió del catálogo), el motivo igual dice qué falta", () => {
  assert.equal(motivoDeLineaSinCantidad(undefined), "Falta la cantidad de un producto");
});
