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

// Orden del dueño (09/11/2026): el voucher no se factura en ARCA, tampoco por el camino de antes.
test("camino de antes: lo cobrado con voucher sale de la base de la factura del turno", () => {
  // Turno de $14.000 pagado entero con voucher: nada que facturar.
  assert.equal(pendienteDelTurno({ cobrado: 14000, precio: 14000, cobradoPorMP: 0, facturadoPorMP: 0, cobradoPorVoucher: 14000 }).pendiente, 0);
  // Voucher $10.000 + $4.000 en efectivo: se factura sólo el efectivo.
  assert.deepEqual(pendienteDelTurno({ cobrado: 14000, precio: 14000, cobradoPorMP: 0, facturadoPorMP: 0, cobradoPorVoucher: 10000 }), { base: 4000, cubierto: 0, pendiente: 4000 });
  // Voucher + seña por MP ya facturada: la seña no se factura dos veces y el voucher tampoco.
  assert.equal(pendienteDelTurno({ cobrado: 14000, precio: 14000, cobradoPorMP: 3000, facturadoPorMP: 3000, cobradoPorVoucher: 10000 }).pendiente, 1000);
  // Sin el dato (tests viejos): como antes.
  assert.equal(pendienteDelTurno({ cobrado: 14000, precio: 14000, cobradoPorMP: 0, facturadoPorMP: 0 }).pendiente, 14000);
});
