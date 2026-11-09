// Pedidos de materiales del taller (T4): validación y transiciones, sin base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chequearAnular, chequearRecibir, gastoDelPedido, MENSAJE_ANULAR, validarPedido } from "./pedidos";

test("validarPedido: proveedor y materiales obligatorios, total > 0, IVA opcional ≥ 0, al centavo", () => {
  assert.equal(validarPedido({ proveedor: " ", descripcion: "MDF", total: 1, iva: null }).ok, false);
  assert.equal(validarPedido({ proveedor: "Maderera", descripcion: "", total: 1, iva: null }).ok, false);
  assert.equal(validarPedido({ proveedor: "Maderera", descripcion: "MDF", total: 0, iva: null }).ok, false);
  assert.equal(validarPedido({ proveedor: "Maderera", descripcion: "MDF", total: Number.NaN, iva: null }).ok, false);
  assert.equal(validarPedido({ proveedor: "Maderera", descripcion: "MDF", total: 10, iva: -1 }).ok, false);
  const v = validarPedido({ proveedor: " Maderera ", descripcion: " MDF ", total: 100.005, iva: null });
  assert.deepEqual(v, { ok: true, pedido: { proveedorNombre: "Maderera", descripcion: "MDF", total: 100.01, iva: 0 } });
});

test("chequearRecibir: sólo un PEDIDO sin gasto se recibe; recibir dos veces no vuelve a cargar", () => {
  assert.equal(chequearRecibir(null), "NO_EXISTE");
  assert.equal(chequearRecibir({ estado: "PEDIDO", gastoId: null }), "OK");
  assert.equal(chequearRecibir({ estado: "RECIBIDO", gastoId: "g1" }), "YA_RECIBIDO");
  assert.equal(chequearRecibir({ estado: "PEDIDO", gastoId: "g1" }), "YA_RECIBIDO");
  assert.equal(chequearRecibir({ estado: "ANULADO", gastoId: null }), "ANULADO");
});

test("chequearAnular: anular uno recibido avisa que el gasto sigue en Costos", () => {
  assert.equal(chequearAnular(null), "NO_EXISTE");
  assert.equal(chequearAnular({ estado: "PEDIDO" }), "ANULADO");
  assert.equal(chequearAnular({ estado: "RECIBIDO" }), "ANULADO_CON_GASTO");
  assert.equal(chequearAnular({ estado: "ANULADO" }), "YA_ANULADO");
  assert.match(MENSAJE_ANULAR.ANULADO_CON_GASTO, /Costos/);
});

test("gastoDelPedido: rubro Materiales, neto = total, IVA y proveedor del pedido, impago", () => {
  const cuando = new Date("2026-11-09T12:00:00Z");
  const g = gastoDelPedido({ proyectoId: "p1", supplierId: "s1", descripcion: "MDF", total: 250000, iva: 52500 }, cuando, "Ale");
  assert.deepEqual(g, { proyectoId: "p1", supplierId: "s1", rubro: "Materiales", descripcion: "Pedido de materiales: MDF", neto: 250000, iva: 52500, fecha: cuando, cargadoPor: "Ale" });
  assert.equal("pagadoEl" in g, false);
});
