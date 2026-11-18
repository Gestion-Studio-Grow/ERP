// GSG-MIA-099 · reglas puras del cierre del NO CUMPLE de MIA-094: Rentabilidad sin el perdido (decisión 1) y la ficha de un
// perdido sin «Avance de cobro» (decisión 3). Las dos, opción A, provisionales a confirmar por el dueño.
import { test } from "node:test";
import assert from "node:assert/strict";
import { totalesDeRentabilidad } from "./empresa-core";
import { avanceDeCobro } from "./ficha-core";

const fila = (neto: number, ganancia: number, perdido: boolean, porCobrar = 0) => ({
  perdidoEl: perdido ? new Date("2026-11-01T12:00:00Z") : null,
  t: { neto, ganancia },
  real: { gananciaReal: null, porPagar: 0 },
  porCobrar,
});

test("decisión 1 · un perdido no suma en «Vendido» ni en «Ganancia presupuestada» de Rentabilidad", () => {
  const r = totalesDeRentabilidad([fila(1000, 300, false, 605), fila(12_415_000, 3_515_000, true)]);
  assert.deepEqual({ neto: r.neto, ganancia: r.ganancia, porCobrar: r.porCobrar }, { neto: 1000, ganancia: 300, porCobrar: 605 });
});

test("decisión 3 · la ficha de un perdido no muestra «Avance de cobro»; uno vivo sí", () => {
  assert.equal(avanceDeCobro({ cobrado: 605, aCobrar: 0 }, true), null);
  assert.equal(avanceDeCobro({ cobrado: 605, aCobrar: 605 }, false), 50);
  assert.equal(avanceDeCobro(null, false), 0);
});
