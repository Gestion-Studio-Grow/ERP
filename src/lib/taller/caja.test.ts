import { test } from "node:test";
import assert from "node:assert/strict";
import { detalleDelCobro, importeDeCaja, metodoDeCaja, repuestosADescontar } from "./caja";

test("caja: cada medio del taller cae en su columna del libro", () => {
  assert.equal(metodoDeCaja("EFECTIVO"), "EFECTIVO");
  assert.equal(metodoDeCaja("TRANSFERENCIA"), "MP");
  assert.equal(metodoDeCaja("MERCADO_PAGO"), "MP");
  assert.equal(metodoDeCaja("DEBITO"), "TARJETA");
  assert.equal(metodoDeCaja("CREDITO"), "TARJETA");
});

test("caja: al libro entra lo que se cobró de verdad, con el recargo de la tarjeta", () => {
  assert.equal(importeDeCaja(32000, 4800), 36800);
  assert.equal(importeDeCaja(69500, 0), 69500);
  assert.equal(detalleDelCobro(12, "AG555ZZ", "Seña"), "Taller · orden #12 · AG555ZZ · Seña");
  assert.equal(detalleDelCobro(12, "AG555ZZ"), "Taller · orden #12 · AG555ZZ");
});

test("stock: sólo salen los repuestos del catálogo, aprobados y puestos por el taller; se suman por producto", () => {
  const base = { tipo: "REPUESTO", decision: "APROBADO", productId: "p1", traidoPorCliente: false, cantidad: 1, descripcion: "Filtro" };
  const salidas = repuestosADescontar([
    base,
    { ...base, cantidad: 2 },
    { ...base, productId: "p2", descripcion: "Aceite", cantidad: 4 },
    { ...base, productId: "p3", decision: "RECHAZADO" },
    { ...base, productId: "p4", decision: "PENDIENTE" },
    { ...base, productId: "p5", traidoPorCliente: true },
    { ...base, productId: null },
    { ...base, productId: "p6", tipo: "MANO_OBRA" },
  ]);
  assert.deepEqual(salidas, [
    { productId: "p1", qty: 3, label: "Filtro" },
    { productId: "p2", qty: 4, label: "Aceite" },
  ]);
});
