// Los pedidos de la tienda contra el motor REAL del club sobre la demo: pegar el mensaje de WhatsApp, entregar
// cobrando, pasar a la cuenta de alguien y cancelar, con la plata y el stock donde tienen que estar.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, PedidoTienda } from "@/lib/club/motor.mjs";
import { SE_DESHACE_TIENDA, armarTienda, ejecutarTienda, fichasParaElPedido, mensajeDeEjemplo } from "./tienda-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): EstadoClub => M.generarDemo(HOY, AHORA.min);

/** Un pedido pendiente como lo deja la tienda: 2 tubos de pelotas y un agua. */
function conPedido(e: EstadoClub): PedidoTienda {
  const r = M.crearPedidoTienda(e, { items: [{ productoId: "p1", cant: 2 }, { productoId: "p2", cant: 1 }], nombre: "Sofi Romero", tel: "11 5555 1234" }, AHORA);
  assert.ok(r.ok);
  return r.pedido;
}
const stock = (e: EstadoClub, id: string) => e.productos.find((p) => p.id === id)!.stock;
const caja = (e: EstadoClub) => M.resumenCaja(e, M.cajaAbierta(e, AHORA));

test("pegar el mensaje de WhatsApp carga el pedido pendiente, con el MISMO código; dos veces, no", () => {
  const e = demo();
  const mensaje = mensajeDeEjemplo(structuredClone(e), AHORA);
  assert.ok(mensaje, "la demo tiene productos en la tienda");
  assert.equal(armarTienda(e).pendientes.length, 0, "la demo arranca sin pedidos");
  const codigo = mensaje.match(/Pedido (T-[A-Z0-9]{4})/)![1];

  const d = ejecutarTienda(e, { tipo: "pegar", texto: mensaje }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const v = armarTienda(e);
  assert.equal(v.pendientes.length, 1);
  assert.equal(v.pendientes[0].codigo, codigo);
  assert.equal(v.pendientes[0].nombre, "Sofi Romero");
  assert.equal(v.pendientes[0].tel, "11 5555 1234");
  assert.match(v.pendientes[0].avisoListo, /^https:\/\/wa\.me\/1155551234\?text=/);
  assert.match(decodeURIComponent(v.pendientes[0].avisoListo), new RegExp(`Tu pedido ${codigo} ya está listo`));
  assert.match(d.mensaje, new RegExp(`Pedido ${codigo} de Sofi Romero cargado`));

  const otra = ejecutarTienda(e, { tipo: "pegar", texto: mensaje }, AHORA);
  assert.equal(otra.ok, false);
  assert.match(otra.mensaje, /ya está cargado/);
  assert.equal(ejecutarTienda(e, { tipo: "pegar", texto: "  " }, AHORA).ok, false);
  assert.equal(ejecutarTienda(e, { tipo: "pegar", texto: "hola, ¿abren mañana?" }, AHORA).ok, false);
});

test("encargar no toca stock ni caja; entregar descuenta el stock y entra a la caja al precio de hoy", () => {
  const e = demo();
  const antes = { p1: stock(e, "p1"), p2: stock(e, "p2"), ingresos: caja(e).ingresos, efectivo: caja(e).porMedio.efectivo };
  const pd = conPedido(e);
  assert.equal(stock(e, "p1"), antes.p1, "encargar no descuenta");
  assert.equal(caja(e).ingresos, antes.ingresos, "encargar no cobra");

  const d = ejecutarTienda(e, { tipo: "entregar", pedidoId: pd.id, medio: "efectivo" }, AHORA, { usuarioId: "u-lu" });
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(stock(e, "p1"), (antes.p1 ?? 0) - 2);
  assert.equal(stock(e, "p2"), (antes.p2 ?? 0) - 1);
  assert.equal(caja(e).ingresos, antes.ingresos + pd.total);
  assert.equal(caja(e).porMedio.efectivo, antes.efectivo + pd.total);
  const v = armarTienda(e);
  assert.equal(v.pendientes.length, 0);
  assert.equal(v.resueltos[0].estado, "entregado");
  assert.match(v.resueltos[0].detalle, /Cobrado .* en efectivo/);
  assert.equal(ejecutarTienda(e, { tipo: "cancelar", pedidoId: pd.id }, AHORA).ok, false, "ya se resolvió");
});

test("a la cuenta de alguien: suma a lo que debe el cliente (su cuenta de cargos) y NO entra a la caja", () => {
  const e = demo();
  const cl = e.clientes.find((c) => c.cc.habilitada && c.deuda === 0 && !M.cuentasAbiertas(e).some((x) => x.clienteId === c.id))!;
  assert.ok(cl, "hay un cliente con cuenta corriente y sin cuenta abierta");
  const ingresos = caja(e).ingresos;
  const movimientos = e.caja.movimientos.length;
  const p1 = stock(e, "p1");
  const pd = conPedido(e);

  const d = ejecutarTienda(e, { tipo: "aCuenta", pedidoId: pd.id, clienteId: cl.id }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, new RegExp(cl.nombre));
  assert.equal(caja(e).ingresos, ingresos, "no entra a la caja");
  assert.equal(e.caja.movimientos.length, movimientos, "ni un movimiento de caja");
  assert.equal(stock(e, "p1"), (p1 ?? 0) - 2, "se lo llevó: el stock baja");
  const cta = M.cuentasAbiertas(e).find((x) => x.clienteId === cl.id)!;
  assert.equal(M.saldoCuenta(cta), pd.total, "lo que debe en su cuenta de cargos es el pedido");
  // Y al cerrar esa cuenta a su cuenta corriente, pasa a su deuda (sin pasar por la caja).
  assert.equal(M.cerrarCuenta(e, cta.id, { aCuenta: true }, AHORA).ok, true);
  assert.equal(M.cliente(e, cl.id)!.deuda, pd.total);
  assert.equal(caja(e).ingresos, ingresos);
  assert.match(armarTienda(e).resueltos[0].detalle, new RegExp(`cuenta de cargos de ${cl.nombre}`));
  assert.equal(ejecutarTienda(e, { tipo: "aCuenta", pedidoId: conPedido(e).id, clienteId: "no-existe" }, AHORA).ok, false);
});

test("cancelar no deja stock ni plata colgados", () => {
  const e = demo();
  const foto = { stock: e.productos.map((p) => [p.id, p.stock, p.prestados ?? 0]), caja: e.caja.movimientos.length, cuentas: e.cuentas.length, deuda: e.clientes.map((c) => c.deuda) };
  const pd = conPedido(e);
  const d = ejecutarTienda(e, { tipo: "cancelar", pedidoId: pd.id }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.deepEqual(e.productos.map((p) => [p.id, p.stock, p.prestados ?? 0]), foto.stock);
  assert.equal(e.caja.movimientos.length, foto.caja);
  assert.equal(e.cuentas.length, foto.cuentas, "no abrió ninguna cuenta");
  assert.deepEqual(e.clientes.map((c) => c.deuda), foto.deuda);
  assert.equal(M.pedidosPendientes(e).length, 0, "y ya no está para retirar");
  assert.equal(armarTienda(e).resueltos[0].marca.texto, "Cancelado");
  assert.equal(ejecutarTienda(e, { tipo: "entregar", pedidoId: pd.id, medio: "efectivo" }, AHORA).ok, false);
});

test("lo que se deshace sigue la lista del vanilla; la firma no cambia si nada cambió", () => {
  assert.deepEqual(SE_DESHACE_TIENDA, { pegar: false, entregar: true, aCuenta: false, cancelar: true });
  const e = demo();
  conPedido(e);
  assert.equal(armarTienda(e).firma, armarTienda(e).firma);
  const f1 = armarTienda(e).firma;
  conPedido(e);
  assert.notEqual(armarTienda(e).firma, f1);
});

test("las fichas para «a la cuenta de…»: las primeras 8 sin buscar; con texto, las que coinciden", () => {
  const e = demo();
  assert.equal(fichasParaElPedido(e, "").length, Math.min(8, e.clientes.filter((c) => c.activo !== false).length));
  const c = e.clientes[3];
  const f = fichasParaElPedido(e, c.nombre.split(" ")[0]);
  assert.ok(f.some((x) => x.id === c.id));
});
