// R1 · una factura por cobro: la cuenta pura del turno y las claves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveCobroBanco, claveCobroMP, claveCobroTurno, pendienteDelTurno } from "./cobros-facturados";

test("claves de cobro: una por camino, con el formato que controla la base", () => {
  assert.equal(claveCobroMP("123"), "mp:123");
  assert.equal(claveCobroTurno("t1"), "turno:t1");
  assert.equal(claveCobroBanco("h1"), "banco:h1");
});

test("turno sin nada facturado por MP: se factura todo lo cobrado (o el precio, sin cobros)", () => {
  assert.equal(pendienteDelTurno({ cobrado: 15000, precio: 15000, cobradoPorMP: 0, facturadoPorMP: 0 }).pendiente, 15000);
  assert.equal(pendienteDelTurno({ cobrado: null, precio: 12000, cobradoPorMP: 0, facturadoPorMP: 0 }).pendiente, 12000);
});

test("seña por MP facturada y ANOTADA en el libro: se factura el resto, la seña no se suma dos veces", () => {
  assert.deepEqual(pendienteDelTurno({ cobrado: 15000, precio: 15000, cobradoPorMP: 5000, facturadoPorMP: 5000 }), {
    base: 15000,
    cubierto: 5000,
    pendiente: 10000,
  });
});

test("seña por MP facturada pero NO anotada en el libro: lo cobrado en el mostrador se factura entero", () => {
  assert.equal(pendienteDelTurno({ cobrado: 10000, precio: 15000, cobradoPorMP: 0, facturadoPorMP: 5000 }).pendiente, 10000);
});

test("sin cobros en el libro: la seña facturada por MP es parte del precio", () => {
  assert.equal(pendienteDelTurno({ cobrado: null, precio: 15000, cobradoPorMP: 0, facturadoPorMP: 5000 }).pendiente, 10000);
});

test("todo cobrado por MP y ya facturado: no queda nada (nunca negativo), al centavo", () => {
  assert.equal(pendienteDelTurno({ cobrado: 15000, precio: 15000, cobradoPorMP: 15000, facturadoPorMP: 15000 }).pendiente, 0);
  assert.equal(pendienteDelTurno({ cobrado: 100, precio: 100, cobradoPorMP: 100, facturadoPorMP: 300 }).pendiente, 0);
  assert.equal(pendienteDelTurno({ cobrado: 0.3, precio: 1, cobradoPorMP: 0.1, facturadoPorMP: 0.1 }).pendiente, 0.2);
});

test("I-2 · un pago de MP está adentro de la factura del turno sólo si el libro lo tiene cobrado por MP", async () => {
  const { pagoCubiertoPorLaFacturaDelTurno: cubierto } = await import("@/lib/invoice-from-appointment");
  // La recepción anotó la seña por MP y nada de MP está anotado todavía: adentro.
  assert.equal(cubierto({ cobradoPorMPDelLibro: 5000, yaAnotadoPorMP: 0, pago: 5000 }), true);
  // No la anotó: la factura del turno no la tiene → se factura por su lado.
  assert.equal(cubierto({ cobradoPorMPDelLibro: 0, yaAnotadoPorMP: 0, pago: 5000 }), false);
  // Lo de MP del libro ya lo cubre otra seña anotada (con su propia factura): éste no entra.
  assert.equal(cubierto({ cobradoPorMPDelLibro: 5000, yaAnotadoPorMP: 5000, pago: 3000 }), false);
  assert.equal(cubierto({ cobradoPorMPDelLibro: 8000, yaAnotadoPorMP: 5000, pago: 3000 }), true);
});
