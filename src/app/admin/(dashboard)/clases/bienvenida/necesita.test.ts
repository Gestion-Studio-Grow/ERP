import { test } from "node:test";
import assert from "node:assert/strict";
import { necesitaBienvenida, RUTA_BIENVENIDA } from "./necesita";

const lunes = { diaSemana: 1, fecha: null, tipo: "DA" };

test("recién dado de alta (sin precio ni horarios): Bienvenida (M-083)", () => {
  assert.equal(necesitaBienvenida({ precioIndividual: 0, franjas: [] }), true);
  assert.equal(necesitaBienvenida({ precioIndividual: null, franjas: null }), true);
});

test("con precio O con horarios ya arrancó: va a Hoy", () => {
  assert.equal(necesitaBienvenida({ precioIndividual: 25000, franjas: [] }), false);
  assert.equal(necesitaBienvenida({ precioIndividual: 0, franjas: [lunes] }), false);
  assert.equal(necesitaBienvenida({ precioIndividual: 25000, franjas: [lunes] }), false);
});

test("un bloqueo o una excepción de un día no cuentan como horarios", () => {
  assert.equal(necesitaBienvenida({ precioIndividual: 0, franjas: [{ diaSemana: null, fecha: "2026-10-24", tipo: "NO" }] }), true);
  assert.equal(necesitaBienvenida({ precioIndividual: 0, franjas: [{ diaSemana: null, fecha: "2026-10-24", tipo: "DA" }] }), true);
  assert.equal(necesitaBienvenida({ precioIndividual: 0, franjas: [{ diaSemana: 2, fecha: null, tipo: "NO" }] }), true);
});

test("la ruta", () => {
  assert.equal(RUTA_BIENVENIDA, "/admin/clases/bienvenida");
});
