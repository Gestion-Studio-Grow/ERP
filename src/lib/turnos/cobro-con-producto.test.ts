import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buscarProductos,
  claveDelCobro,
  claveDelPedido,
  coincideConLoGrabado,
  ETIQUETA_DE_TARJETA,
  rechazoDeCantidad,
  esMedioConProducto,
  esMedioDeTarjeta,
  leerClave,
  leerRenglones,
  totalDelCobro,
} from "./cobro-con-producto";

test("totalDelCobro · saldo del turno + productos, redondeado", () => {
  assert.deepEqual(totalDelCobro({ saldo: 18000, renglones: [{ qty: 1, precio: 6000 }] }), { turno: 18000, productos: 6000, total: 24000 });
  assert.deepEqual(totalDelCobro({ saldo: 0, renglones: [{ qty: 2, precio: 1234.555 }] }), { turno: 0, productos: 2469.11, total: 2469.11 });
  assert.deepEqual(totalDelCobro({ saldo: -50, renglones: [] }), { turno: 0, productos: 0, total: 0 });
  assert.deepEqual(totalDelCobro({ saldo: 13000, renglones: [{ qty: 1, precio: 4500 }, { qty: 3, precio: 1000 }] }).total, 20500);
});

test("leerRenglones · suma el mismo producto, rechaza cantidades malas y la lista vacía", () => {
  assert.deepEqual(leerRenglones(JSON.stringify([{ productId: "p1", qty: 1 }, { productId: "p1", qty: 2 }, { productId: "p2", qty: "1" }])), {
    ok: true,
    renglones: [{ productId: "p1", qty: 3 }, { productId: "p2", qty: 1 }],
  });
  assert.equal(leerRenglones("[]").ok, false);
  assert.equal(leerRenglones("no es json").ok, false);
  assert.equal(leerRenglones(null).ok, false);
  assert.equal(leerRenglones(JSON.stringify([{ productId: "p1", qty: 0 }])).ok, false);
  assert.equal(leerRenglones(JSON.stringify([{ productId: "p1", qty: -1 }])).ok, false);
  assert.equal(leerRenglones(JSON.stringify([{ productId: "", qty: 1 }])).ok, false);
  assert.equal(leerRenglones(JSON.stringify([{ productId: "p1", qty: 600 }, { productId: "p1", qty: 600 }])).ok, false);
  assert.equal(leerRenglones(JSON.stringify(Array.from({ length: 31 }, (_, i) => ({ productId: `p${i}`, qty: 1 })))).ok, false);
});

test("medios · los cinco de D-C01; tarjeta = Débito y Crédito", () => {
  for (const m of ["EFECTIVO", "TRANSFERENCIA", "MERCADOPAGO", "DEBITO", "CREDITO"]) assert.ok(esMedioConProducto(m));
  assert.ok(!esMedioConProducto("CHEQUE"));
  assert.ok(esMedioDeTarjeta("DEBITO") && esMedioDeTarjeta("CREDITO") && !esMedioDeTarjeta("EFECTIVO"));
});

test("claves · una para el cobro y la del pedido derivada; la del formulario con forma", () => {
  const c = "0b6d1c2e-1111-4222-8333-444455556666";
  assert.equal(leerClave(` ${c} `), c);
  assert.equal(leerClave("corta"), null);
  assert.equal(leerClave("con espacio adentro"), null);
  assert.equal(leerClave(undefined), null);
  assert.notEqual(claveDelCobro(c), claveDelPedido(c));
  assert.ok(claveDelPedido(c).startsWith(claveDelCobro(c)));
});

test("buscarProductos · sin acentos ni mayúsculas, hasta 8", () => {
  const lista = [{ name: "Sérum facial" }, { name: "Crema de manos" }, { name: "CREMA corporal" }];
  assert.deepEqual(buscarProductos(lista, "crema").map((p) => p.name), ["Crema de manos", "CREMA corporal"]);
  assert.deepEqual(buscarProductos(lista, "serum").map((p) => p.name), ["Sérum facial"]);
  assert.equal(buscarProductos(Array.from({ length: 20 }, (_, i) => ({ name: `P${i}` })), "").length, 8);
});

test("rechazoDeCantidad · por unidad de a enteros; por kilo con decimales", () => {
  assert.equal(rechazoDeCantidad("UNIT", 1), null);
  assert.equal(rechazoDeCantidad("UNIT", 3), null);
  assert.match(rechazoDeCantidad("UNIT", 0.001) ?? "", /entero/);
  assert.match(rechazoDeCantidad("UNIT", 1.5) ?? "", /entero/);
  assert.match(rechazoDeCantidad("UNIT", 0) ?? "", /mayor a cero/);
  assert.match(rechazoDeCantidad("WEIGHT", -1) ?? "", /mayor a cero/);
  assert.equal(rechazoDeCantidad("WEIGHT", 0.25), null);
});

test("coincideConLoGrabado · mismos productos, cantidades y medio; si no, no", () => {
  const grabado = { method: "EFECTIVO", renglones: [{ productId: "a", qty: 1 }, { productId: "b", qty: 2 }] };
  assert.equal(coincideConLoGrabado({ method: "EFECTIVO", renglones: [{ productId: "b", qty: 2 }, { productId: "a", qty: 1 }] }, grabado), true);
  assert.equal(coincideConLoGrabado({ method: "TRANSFERENCIA", renglones: grabado.renglones }, grabado), false);
  assert.equal(coincideConLoGrabado({ method: "EFECTIVO", renglones: [{ productId: "a", qty: 1 }] }, grabado), false);
  assert.equal(coincideConLoGrabado({ method: "EFECTIVO", renglones: [{ productId: "a", qty: 1 }, { productId: "b", qty: 3 }] }, grabado), false);
  assert.equal(coincideConLoGrabado({ method: "EFECTIVO", renglones: [{ productId: "a", qty: 1 }, { productId: "c", qty: 2 }] }, grabado), false);
});

test("ETIQUETA_DE_TARJETA · Débito y Crédito en criollo", () => {
  assert.equal(ETIQUETA_DE_TARJETA.DEBITO, "Débito");
  assert.equal(ETIQUETA_DE_TARJETA.CREDITO, "Crédito");
});
