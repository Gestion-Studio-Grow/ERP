// UN SOLO FIADO (Magra, tanda 2 · 2D) — lo puro: cuándo la entrega va a la cuenta, cuánto debe y
// desde cuándo, el texto del recordatorio (el mismo de la bandeja) y «Venderle» / «Repetir».

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deudaDelCliente,
  desdeCuando,
  fiadoAlEntregar,
  hrefRepetir,
  hrefVenderle,
  leerPedidoDeVenta,
  mensajeEntregaAlFiado,
  mensajeEntregaSinAppDeFiado,
  recordatorioDePago,
  renglonesParaRepetir,
} from "./fiado";

test("la entrega sin cobrar va a la cuenta sólo con boutique + cuentas corrientes + la app de Fiado + ficha", () => {
  const todo = { boutique: true, cuentasCorrientes: true, appCuentas: true, clientId: "c1" };
  assert.deepEqual(fiadoAlEntregar(todo), { va: true });
  assert.deepEqual(fiadoAlEntregar({ ...todo, boutique: false }), { va: false, motivo: "apagado" }, "CH y Shine: la entrega de siempre");
  assert.deepEqual(fiadoAlEntregar({ ...todo, cuentasCorrientes: false }), { va: false, motivo: "apagado" });
  assert.deepEqual(fiadoAlEntregar({ ...todo, appCuentas: false }), { va: false, motivo: "sin-app" });
  assert.deepEqual(fiadoAlEntregar({ ...todo, clientId: null }), { va: false, motivo: "sin-ficha" });
  assert.match(mensajeEntregaAlFiado({ code: 128, cliente: "Ana Pérez", monto: "$ 25.700" }), /#128.*cuenta de Ana Pérez.*\$ 25\.700/);
});

test("lo que debe: cuenta corriente + pedidos entregados sin cobrar, al centavo, desde la deuda más vieja", () => {
  const sab = new Date("2026-10-17T15:00:00Z");
  const lun = new Date("2026-10-19T15:00:00Z");
  const d = deudaDelCliente({
    cuentas: [
      { saldo: 15700, emitida: lun },
      { saldo: 0, emitida: new Date("2026-10-01T15:00:00Z") }, // saldada: no cuenta ni para «desde»
    ],
    pedidosSinCobrar: [
      { code: 99, total: 4135.575, cobrado: 0, desde: sab },
      { code: 100, total: 10000, cobrado: 10000, desde: new Date("2026-09-01T15:00:00Z") }, // pagado con seña entera
    ],
  });
  assert.equal(d.cuenta, 15700);
  assert.deepEqual(d.pedidos, [{ code: 99, monto: 4135.58 }]);
  assert.equal(d.total, 19835.58);
  assert.equal(d.desde?.toISOString(), sab.toISOString());
  assert.deepEqual(deudaDelCliente({ cuentas: [], pedidosSinCobrar: [] }), { total: 0, cuenta: 0, pedidos: [], desde: null });
});

test("desde cuándo, en criollo: hoy, ayer, el día de la semana, o la fecha", () => {
  assert.equal(desdeCuando("2026-10-22", "2026-10-22"), "desde hoy");
  assert.equal(desdeCuando("2026-10-21", "2026-10-22"), "desde ayer");
  assert.equal(desdeCuando("2026-10-17", "2026-10-22"), "desde el sábado");
  assert.equal(desdeCuando("2026-10-12", "2026-10-22"), "desde el 12/10");
});

test("el recordatorio: con un pedido es el MISMO texto de la bandeja (2C); sin pedido habla de la cuenta", () => {
  // El texto que antes era `recordatorioDeCobro` de la bandeja (2C): integrados, es éste.
  const bandeja =
    "¡Hola Ana! Te escribimos de Magra por el pedido #128: quedó pendiente el pago de $ 25.700. " +
    "Cuando puedas, lo pagás en el local, por transferencia o con Mercado Pago. ¡Gracias!";
  assert.equal(recordatorioDePago({ cliente: "Ana Pérez", negocio: "Magra", monto: "$ 25.700", pedido: 128 }), bandeja);
  const cuenta = recordatorioDePago({ cliente: "Ana Pérez", negocio: "Magra", monto: "$ 43.400", desde: "desde el sábado" });
  assert.match(cuenta, /^¡Hola Ana! Te escribimos de Magra: en tu cuenta quedó pendiente \$ 43\.400 desde el sábado\./);
  assert.match(recordatorioDePago({ cliente: "Mostrador", negocio: "Magra", monto: "$ 1" }), /^¡Hola! /);
});

test("«Venderle» y «Repetir»: la dirección de Vender y su lectura (lo que no tiene forma, no cuenta)", () => {
  assert.equal(hrefVenderle("cl_1"), "/admin/vender?cliente=cl_1");
  assert.equal(hrefRepetir("cl_1", 128), "/admin/vender?cliente=cl_1&repetir=128");
  assert.deepEqual(leerPedidoDeVenta({ cliente: "cl_1", repetir: "128" }), { clienteId: "cl_1", repetir: 128 });
  assert.deepEqual(leerPedidoDeVenta({ cliente: "cl_1" }), { clienteId: "cl_1", repetir: null });
  assert.deepEqual(leerPedidoDeVenta({ repetir: "128" }), { clienteId: null, repetir: null }, "sin cliente no se repite nada");
  assert.deepEqual(leerPedidoDeVenta({ cliente: "x'; DROP", repetir: "-3" }), { clienteId: null, repetir: null });
  assert.deepEqual(leerPedidoDeVenta({ cliente: ["a1", "b2"], repetir: ["0"] }), { clienteId: "a1", repetir: null });
});

test("Repetir: lo por kilo se vuelve a pesar, por unidad la misma cantidad; el envío no se repite y lo que no está a la venta se nombra", () => {
  const r = renglonesParaRepetir(
    [
      { productId: "vacio", name: "Vacío", quantity: 1.28, saleUnit: "WEIGHT" },
      { productId: "chorizo", name: "Chorizo", quantity: 6, saleUnit: "UNIT" },
      { productId: null, name: "Envío · Canning – barrios cerrados", quantity: 1, saleUnit: "UNIT" },
      { productId: null, name: "Pieza especial", quantity: 1, saleUnit: "UNIT" },
      { productId: "entrana-vieja", name: "Entraña", quantity: 1, saleUnit: "WEIGHT" },
    ],
    new Set(["vacio", "chorizo"]),
  );
  assert.deepEqual(r.renglones, [
    { productId: "vacio", nombre: "Vacío", porPeso: true, qtyText: "" },
    { productId: "chorizo", nombre: "Chorizo", porPeso: false, qtyText: "6" },
  ]);
  assert.deepEqual(r.omitidos, ["Pieza especial", "Entraña"]);
});

test("O-2 · sin la app de Fiado, la entrega sin cobrar lo dice: no quedó en la cuenta y sigue «a cobrar»", () => {
  const m = mensajeEntregaSinAppDeFiado(131);
  assert.match(m, /#131/);
  assert.match(m, /NO quedó en la cuenta/);
  assert.match(m, /Trabaja por apps/);
  assert.match(m, /Entregado · a cobrar/);
});
