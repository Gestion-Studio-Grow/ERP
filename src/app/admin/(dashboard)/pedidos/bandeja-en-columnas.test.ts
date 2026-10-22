// LA BANDEJA EN COLUMNAS, sin base (Magra, tanda 2 · 2C): cada pedido en su columna, en orden de
// llegada, UNA tecla por tarjeta, el resumen de lo que lleva, «No retiró» y «Recordarle» el pago.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bandejaEnColumnas,
  columnaDelPedido,
  conteosDeLasColumnas,
  leerColumnaDeLaUrl,
  puedeMarcarNoRetiro,
  resumenDeLineas,
  teclaDeLaTarjeta,
  type PedidoDelTablero,
} from "./pedidos-core";
import { recordatorioDePago } from "@/lib/clientes/fiado";

function pedido(o: Partial<PedidoDelTablero> & { id: string; status: string }): PedidoDelTablero {
  return {
    code: Number(o.id.replace(/\D/g, "")) || 1,
    cuando: "10:00",
    creado: "2026-10-22T13:00:00.000Z",
    canal: "ONLINE",
    cliente: "Ana Pérez",
    telefono: "11 5555-1234",
    entrega: "PICKUP",
    horario: null,
    horarioIso: null,
    direccion: null,
    nota: null,
    verbo: null,
    cobrado: false,
    medio: null,
    total: 25700,
    subtotal: 25700,
    descuento: 0,
    lineas: [],
    avisoWa: null,
    avisado: null,
    ...o,
  };
}

test("cada pedido va a su columna: Nuevos · Preparando · Listos · En reparto · A cobrar; lo cerrado no entra", () => {
  assert.equal(columnaDelPedido({ status: "PENDING", cobrado: false }), "nuevos");
  assert.equal(columnaDelPedido({ status: "CONFIRMED", cobrado: true }), "nuevos", "el del mostrador nace confirmado");
  assert.equal(columnaDelPedido({ status: "PREPARING", cobrado: false }), "preparando");
  assert.equal(columnaDelPedido({ status: "READY", cobrado: false }), "listos");
  assert.equal(columnaDelPedido({ status: "READY", cobrado: false, reparto: { desde: "17:05" } }), "en-reparto");
  assert.equal(columnaDelPedido({ status: "DELIVERED", cobrado: false }), "a-cobrar");
  assert.equal(columnaDelPedido({ status: "DELIVERED", cobrado: true }), null);
  assert.equal(columnaDelPedido({ status: "CANCELLED", cobrado: false }), null);
  assert.equal(columnaDelPedido({ status: "DELIVERED", cobrado: false, reparto: { desde: "17:05" } }), "a-cobrar", "la marca sólo cuenta en un Listo");
});

test("dentro de la columna, el que más espera primero; en Listos, primero el de horario más temprano", () => {
  const ps = [
    pedido({ id: "p3", status: "PENDING", creado: "2026-10-22T13:10:00.000Z" }),
    pedido({ id: "p1", status: "PENDING", creado: "2026-10-22T12:00:00.000Z" }),
    pedido({ id: "p5", status: "READY", creado: "2026-10-22T09:00:00.000Z" }),
    pedido({ id: "p6", status: "READY", creado: "2026-10-22T11:00:00.000Z", horarioIso: "2026-10-22T20:00:00.000Z" }),
    pedido({ id: "p7", status: "READY", creado: "2026-10-22T12:00:00.000Z", horarioIso: "2026-10-22T14:00:00.000Z" }),
    pedido({ id: "p8", status: "READY", reparto: { desde: "17:05" } }),
    pedido({ id: "p9", status: "DELIVERED" }),
    pedido({ id: "p10", status: "DELIVERED", cobrado: true }),
  ];
  const c = bandejaEnColumnas(ps);
  assert.deepEqual(c.nuevos.map((p) => p.code), [1, 3]);
  assert.deepEqual(c.listos.map((p) => p.code), [7, 6, 5]);
  assert.deepEqual(c["en-reparto"].map((p) => p.code), [8]);
  assert.deepEqual(c["a-cobrar"].map((p) => p.code), [9]);
  assert.deepEqual(conteosDeLasColumnas(c), { nuevos: 2, preparando: 0, listos: 3, "en-reparto": 1, "a-cobrar": 1 });
});

test("UNA tecla por tarjeta: Armar · Seguir armando · Entregar y cobrar · Rendición del cadete · Cobrar", () => {
  assert.deepEqual(teclaDeLaTarjeta(pedido({ id: "p128", status: "PENDING" })), { tipo: "armar", texto: "Armar", href: "/admin/pedidos/128/armar" });
  assert.deepEqual(teclaDeLaTarjeta(pedido({ id: "p128", status: "PREPARING" })), { tipo: "seguir", texto: "Seguir armando", href: "/admin/pedidos/128/armar" });
  assert.deepEqual(teclaDeLaTarjeta(pedido({ id: "p1", status: "READY" })), { tipo: "entregar", texto: "Entregar y cobrar" });
  assert.deepEqual(teclaDeLaTarjeta(pedido({ id: "p1", status: "READY", cobrado: true })), { tipo: "entregar", texto: "Entregar" });
  assert.deepEqual(teclaDeLaTarjeta(pedido({ id: "p1", status: "READY", reparto: { desde: "17:05" } })), {
    tipo: "rendicion",
    texto: "Rendición del cadete",
    href: "/admin/pedidos/reparto/rendicion",
  });
  assert.deepEqual(teclaDeLaTarjeta(pedido({ id: "p1", status: "DELIVERED" })), { tipo: "cobrar", texto: "Cobrar" });
  assert.equal(teclaDeLaTarjeta(pedido({ id: "p1", status: "CANCELLED" })), null);
});

test("la pestaña de la URL: lo desconocido es Nuevos", () => {
  assert.equal(leerColumnaDeLaUrl("listos"), "listos");
  assert.equal(leerColumnaDeLaUrl("en-reparto"), "en-reparto");
  assert.equal(leerColumnaDeLaUrl("<x>"), "nuevos");
  assert.equal(leerColumnaDeLaUrl(null), "nuevos");
});

test("lo que lleva, corto y sin el envío: «0,5 kg Vacío · 6 × Chorizo»; más de tres, «y N más»", () => {
  const l = (nombre: string, unidad: "UNIT" | "WEIGHT", cantidad: number, productId: string | null = "p", marca: string | null = null) => ({
    productId,
    nombre,
    unidad,
    cantidad,
    precio: 0,
    total: 0,
    marca,
  });
  assert.equal(resumenDeLineas([l("Vacío", "WEIGHT", 0.5), l("Chorizo", "UNIT", 6), l("Envío · Canning", "UNIT", 1, null, "envío")]), "0,5 kg Vacío · 6 × Chorizo");
  assert.equal(resumenDeLineas([l("Envío a domicilio", "UNIT", 1, null)]), "", "el envío sin marca también se saca");
  assert.equal(resumenDeLineas([l("A", "UNIT", 1), l("B", "WEIGHT", 1.2345), l("C", "UNIT", 2), l("D", "UNIT", 1), l("E", "UNIT", 1)]), "1 × A · 1,235 kg B · 2 × C y 2 más");
});

test("«No retiró» sólo en un retiro Listo; el recordatorio del pago dice número, plata y cómo pagar", () => {
  assert.equal(puedeMarcarNoRetiro({ status: "READY", entrega: "PICKUP" }), true);
  assert.equal(puedeMarcarNoRetiro({ status: "READY", entrega: "DELIVERY" }), false, "un envío que vuelve se rinde como «Volvió»");
  assert.equal(puedeMarcarNoRetiro({ status: "PREPARING", entrega: "PICKUP" }), false);
  // Un solo texto con la ficha (2D): `recordatorioDePago` con el pedido.
  const t = recordatorioDePago({ cliente: "Ana Pérez", pedido: 128, monto: "$25.700", negocio: "Magra" });
  assert.match(t, /^¡Hola Ana! Te escribimos de Magra por el pedido #128: quedó pendiente el pago de \$25\.700\./);
  assert.match(t, /transferencia o con Mercado Pago/);
  assert.match(recordatorioDePago({ cliente: "Mostrador", pedido: 1, monto: "$1", negocio: "Magra" }), /^¡Hola! /);
});
