import { test } from "node:test";
import assert from "node:assert/strict";
import { leerNumero, pesos } from "./core";
import { importe, ofreceNuevaVersion, textoCostoUnitario } from "./presupuesto-vista-core";

// Ida y vuelta: lo que se muestra se vuelve a leer como el mismo número (sacando el signo de la moneda).
const vuelta = (texto: string) => leerNumero(texto.replace(/^-?(US)?\$ ?/, ""));

test("V3-b: el costo unitario de la ficha pasa por el helper de plata, con ida y vuelta", () => {
  // Calculado a mano: 1.500,75 pesos; 2.000 pesos; 150 dólares.
  assert.equal(textoCostoUnitario(1500.75, "ARS"), pesos(1500.75));
  assert.equal(textoCostoUnitario(1500.75, "ARS"), "$ 1.500,75");
  assert.equal(textoCostoUnitario(2000, "ARS"), "$ 2.000");
  assert.equal(textoCostoUnitario(150, "USD"), "US$ 150");
  assert.equal(textoCostoUnitario(null, "ARS"), "$ 0");
  for (const n of [0, 1, 2000, 1500.75, 107258.06, 1.01]) assert.equal(vuelta(textoCostoUnitario(n, "ARS")), n);
  assert.equal(vuelta(textoCostoUnitario(150, "USD")), 150);
});

test("V3: importe es la única regla: pesos en ARS, la moneda propia si no", () => {
  assert.equal(importe(2000), pesos(2000));
  assert.equal(importe(150, "USD"), "US$ 150");
});

test("V2: «Nueva versión» no se ofrece con una base aprobada", () => {
  assert.equal(ofreceNuevaVersion({ baseAprobada: true, hayBorrador: false }), false);
  assert.equal(ofreceNuevaVersion({ baseAprobada: false, hayBorrador: false }), true);
  assert.equal(ofreceNuevaVersion({ baseAprobada: false, hayBorrador: true }), false);
  assert.equal(ofreceNuevaVersion({ baseAprobada: true, hayBorrador: true }), false);
});
