// El buffet y el fiado con código contra el motor REAL sobre la demo: cargar por código o por nombre, las mesas
// que siguen cargando, cobrar y cerrar (la cuenta cierra en cero), pasar a cuenta corriente y, sin cuenta
// corriente, el OK del dueño con el código de 6 letras y sus 5 intentos. Los créditos nunca quedan negativos.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { armarBuffet, armarCuentaBuffet, compartirBuffet, confirmarCreditosCuenta, ejecutarBuffet, productosParaCargar } from "./buffet-core";
import { aprobarConCodigo, codigoDeLaDemo, pedidosPendientes, pedirFiado, INTENTOS_POR_PEDIDO } from "./credito-core";
import { ejecutar } from "./cuenta-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; auth: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, auth: operadorDeLaDemo(e, "RECEPTION")!.auth };
};
const caja = (e: EstadoClub) => M.resumenCaja(e).ingresos;

test("cargar por código del lector (interno o de fábrica, sin mayúsculas) o por nombre; sólo lo vendible", () => {
  const { e } = demo();
  const conCodigo = e.productos.find((p) => p.codigo && p.precio > 0 && p.activo !== false && (p.stock === null || p.stock > 0))!;
  const porCodigo = productosParaCargar(e, conCodigo.codigo.toLowerCase());
  assert.equal(porCodigo.porCodigo, true);
  assert.deepEqual(porCodigo.productos.map((p) => p.id), [conCodigo.id]);
  const porNombre = productosParaCargar(e, conCodigo.nombre.slice(0, 4));
  assert.equal(porNombre.porCodigo, false);
  assert.ok(porNombre.productos.some((p) => p.id === conCodigo.id));
  assert.ok(porNombre.productos.length <= 8);
  const sinStock = e.productos.find((p) => p.stock !== null && p.stock > 0 && p.precio > 0)!;
  sinStock.stock = 0;
  assert.ok(!productosParaCargar(e, sinStock.nombre).productos.some((p) => p.id === sinStock.id), "lo que no tiene stock no se ofrece");
});

test("la mesa sigue: con la cancha cerrada se cargan cargos, aparece en «Mesas que siguen cargando» y al cobrar cierra en cero (caja = cobrado)", () => {
  const { e, auth } = demo();
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "en_cancha" && x.jugadores.length === 4 && M.saldo(x) > 0)!;
  assert.equal(ejecutar(e, r.id, { tipo: "cerrarYSeguir", medio: "efectivo" }, AHORA, auth).ok, true);
  const b = armarBuffet(e);
  const mesa = b.mesas.find((m) => m.reservaId === r.id);
  assert.ok(mesa, "la mesa figura en «Mesas que siguen cargando»");
  const cta = b.cuentas.find((c) => mesa.cuentas.includes(c.id))!;
  const prod = productosParaCargar(e, "").productos[0];
  const d = ejecutarBuffet(e, { tipo: "cargar", cuentaId: cta.id, productoId: prod.id, cant: 2 }, AHORA, auth);
  assert.equal(d.ok, true, d.mensaje);
  const conCargo = armarCuentaBuffet(e, M.cuenta(e, cta.id)!);
  assert.equal(conCargo.saldo, cta.saldo + 2 * prod.precio);

  const antes = caja(e);
  const cobro = ejecutarBuffet(e, { tipo: "cobrar", cuentaId: cta.id, medio: "transferencia" }, AHORA, auth);
  assert.equal(cobro.ok, true, cobro.mensaje);
  assert.equal(caja(e) - antes, conCargo.aCobrar, "caja = cobrado");
  assert.equal(M.cuenta(e, cta.id)!.estado, "cerrada");
  assert.equal(M.saldoCuenta(M.cuenta(e, cta.id)!), 0, "la cuenta cierra en cero");
  // «−» devuelve al stock y nunca deja la cuenta por debajo de lo pagado.
  const otra = ejecutarBuffet(e, { tipo: "abrir", titular: "Mostrador prueba", clienteId: null }, AHORA, auth);
  assert.equal(otra.ok, true);
  const nueva = M.cuentasAbiertas(e).find((c) => c.titular === "Mostrador prueba")!;
  const p = e.productos.find((x) => x.id === prod.id)!;
  const stock = p.stock;
  ejecutarBuffet(e, { tipo: "cargar", cuentaId: nueva.id, productoId: prod.id, cant: 1 }, AHORA, auth);
  assert.equal(ejecutarBuffet(e, { tipo: "ajustar", cuentaId: nueva.id, itemIdx: 0, delta: -1 }, AHORA, auth).ok, true);
  assert.equal(p.stock, stock);
});

test("compartirBuffet: cargar en una cuenta sólo cambia SU tarjeta", () => {
  const { e, auth } = demo();
  const v1 = armarBuffet(e);
  assert.ok(v1.cuentas.length >= 2, "la demo trae varias cuentas abiertas");
  assert.equal(compartirBuffet(v1, armarBuffet(e)), v1);
  const blanco = v1.cuentas[0];
  const prod = productosParaCargar(e, "").productos[0];
  ejecutarBuffet(e, { tipo: "cargar", cuentaId: blanco.id, productoId: prod.id, cant: 1 }, AHORA, auth);
  const v2 = compartirBuffet(v1, armarBuffet(e));
  const nuevas = v2.cuentas.filter((c) => !v1.cuentas.includes(c)).map((c) => c.id);
  assert.deepEqual(nuevas, [blanco.id]);
});

test("créditos del cliente: la confirmación dice de quién, cuánto y con cuánto queda; si no alcanzan, no se ofrece y no quedan negativos", () => {
  const { e, auth } = demo();
  const cta = M.cuentasAbiertas(e).find((c) => c.clienteId && M.saldoCuenta(c) > 0)!;
  const ficha = M.cliente(e, cta.clienteId!)!;
  const aCobrar = armarCuentaBuffet(e, cta).aCobrar;
  ficha.monedero = aCobrar - 1;
  const corto = confirmarCreditosCuenta(e, cta.id);
  assert.equal(corto.ok, false);
  const res = ejecutarBuffet(e, { tipo: "cobrar", cuentaId: cta.id, medio: "monedero" }, AHORA, auth);
  assert.equal(res.ok, false, "el motor tampoco deja");
  assert.equal(ficha.monedero, aCobrar - 1, "los créditos no se tocaron");

  ficha.monedero = aCobrar + 500;
  const conf = confirmarCreditosCuenta(e, cta.id);
  assert.ok(conf.ok);
  assert.deepEqual([conf.de, conf.usa, conf.creditos, conf.quedan], [ficha.nombre, aCobrar, aCobrar + 500, 500]);
  const antes = caja(e);
  assert.equal(ejecutarBuffet(e, { tipo: "cobrar", cuentaId: cta.id, medio: "monedero" }, AHORA, auth).ok, true);
  assert.equal(ficha.monedero, 500, "queda exactamente lo que dijo la confirmación");
  assert.equal(caja(e), antes, "los créditos no entran a la caja");
});

test("fiar con el OK del dueño: sin cuenta corriente no pasa; se pide, el código bueno aprueba y la cuenta va a su cuenta corriente", () => {
  const { e, auth } = demo();
  const cta = M.cuentasAbiertas(e).find((c) => {
    const f = c.clienteId ? M.cliente(e, c.clienteId) : null;
    return f && !f.cc.habilitada && M.saldoCuenta(c) > 0 && !c.aCargoDe && !e.novedades.some((n) => n.estado === "pendiente" && n.clienteId === f.id);
  });
  assert.ok(cta, "la demo trae una cuenta de alguien sin cuenta corriente");
  const ficha = M.cliente(e, cta.clienteId!)!;
  const v = armarCuentaBuffet(e, cta);
  assert.equal(v.aCuenta.ok, false);
  assert.equal(!v.aCuenta.ok && v.aCuenta.puedePedirFiado, true);
  assert.equal(ejecutarBuffet(e, { tipo: "aCuenta", cuentaId: cta.id }, AHORA, auth).ok, false);

  const pedido = pedirFiado(e, cta.id, auth, AHORA);
  assert.equal(pedido.ok, true, pedido.mensaje);
  const p = pedidosPendientes(e).find((x) => x.cliente === ficha.nombre)!;
  assert.ok(p);
  assert.equal(p.monto, v.aCobrar);
  assert.equal(p.quedan, INTENTOS_POR_PEDIDO);
  assert.equal(pedirFiado(e, cta.id, auth, AHORA).ok, false, "no se pide dos veces");

  const mal = aprobarConCodigo(e, p.id, "ZZZ-ZZZ", auth, AHORA);
  assert.equal(mal.ok, false);
  assert.equal(pedidosPendientes(e).find((x) => x.id === p.id)!.quedan, INTENTOS_POR_PEDIDO - 1);
  const bueno = codigoDeLaDemo(e, p.id)!;
  assert.match(bueno.codigo, /^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  const ok = aprobarConCodigo(e, p.id, bueno.codigo.toLowerCase().replace("-", ""), auth, AHORA);
  assert.equal(ok.ok, true, ok.mensaje);
  assert.ok(!pedidosPendientes(e).some((x) => x.id === p.id));

  const deudaAntes = ficha.deuda;
  const cajaAntes = caja(e);
  const pasa = ejecutarBuffet(e, { tipo: "aCuenta", cuentaId: cta.id }, AHORA, auth);
  assert.equal(pasa.ok, true, pasa.mensaje);
  assert.equal(ficha.deuda - deudaAntes, v.aCobrar, "lo fiado va a su cuenta corriente");
  assert.equal(caja(e), cajaAntes, "fiar no es cobrar: la caja no se mueve");
});

test("cinco códigos mal traban el pedido: el código bueno tampoco pasa hasta que vence la traba", () => {
  const { e, auth } = demo();
  const cta = M.cuentasAbiertas(e).find((c) => {
    const f = c.clienteId ? M.cliente(e, c.clienteId) : null;
    return f && !f.cc.habilitada && M.saldoCuenta(c) > 0 && !c.aCargoDe && !e.novedades.some((n) => n.estado === "pendiente" && n.clienteId === f.id);
  })!;
  assert.equal(pedirFiado(e, cta.id, auth, AHORA).ok, true);
  const p = pedidosPendientes(e).find((x) => x.cliente === M.cliente(e, cta.clienteId!)!.nombre)!;
  for (let i = 0; i < INTENTOS_POR_PEDIDO; i++) aprobarConCodigo(e, p.id, "AAA-AAA", auth, AHORA);
  const trabado = pedidosPendientes(e).find((x) => x.id === p.id)!;
  assert.match(trabado.trabado ?? "", /Trabado hasta las 19:40/);
  const bueno = codigoDeLaDemo(e, p.id)!.codigo;
  assert.equal(aprobarConCodigo(e, p.id, bueno, auth, AHORA).ok, false);
  assert.equal(aprobarConCodigo(e, p.id, bueno, auth, { fecha: HOY, min: AHORA.min + 31 }).ok, true);
});
