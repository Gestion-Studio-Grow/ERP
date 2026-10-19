import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coincide,
  conteosDelTablero,
  filtrarPedidos,
  leerFiltrosDelTablero,
  lineaDelTablero,
  loteDelTablero,
  ordenarPedidos,
  resumenDelLote,
  rielDelPedido,
  teclaDelPedido,
  cuandoDelPedido,
  quedoElPedido,
  listoDesdeAyer,
  otrosPedidosDeLaClienta,
  textoDeOtrosPedidos,
  pedidosDeLaTiendaEsperando,
  textoDeLaTiendaEsperando,
  ESPERA_DE_LA_TIENDA_MIN,
  type PedidoDelTablero,
} from "./pedidos-core";

function pedido(o: Partial<PedidoDelTablero> & { id: string; status: string }): PedidoDelTablero {
  return {
    code: Number(o.id.replace(/\D/g, "")) || 1,
    cuando: "10:00",
    creado: "2026-09-24T13:00:00.000Z",
    canal: "ONLINE",
    cliente: "Ana Ruiz",
    telefono: "11 5555-0101",
    entrega: "PICKUP",
    horario: null,
    horarioIso: null,
    direccion: null,
    nota: null,
    verbo: null,
    cobrado: false,
    medio: null,
    total: 1000,
    subtotal: 1000,
    descuento: 0,
    lineas: [],
    avisoWa: null,
    avisado: null,
    ...o,
  };
}

const params = (q: string) => new URLSearchParams(q);

test("el riel de un comercio tiene cuatro pasos físicos y el cobro no es uno de ellos", () => {
  const pendiente = rielDelPedido({ status: "PENDING", cobrado: true }, true);
  assert.deepEqual(pendiente.pasos, ["Recibido", "En preparación", "Listo", "Entregado"]);
  assert.equal(pendiente.hechos, 1);
  assert.equal(pendiente.palabra, "Pendiente");
  assert.equal(rielDelPedido({ status: "CONFIRMED", cobrado: false }, true).hechos, 1, "el pedido del mostrador nace confirmado: sigue en el primer paso");
  assert.equal(rielDelPedido({ status: "PREPARING", cobrado: false }, true).tipo, "medias");
  assert.equal(rielDelPedido({ status: "READY", cobrado: false }, true).hechos, 3);
});

test("en un negocio de servicios el riel conserva el paso Confirmado", () => {
  const r = rielDelPedido({ status: "CONFIRMED", cobrado: false }, false);
  assert.equal(r.pasos.length, 5);
  assert.equal(r.hechos, 2);
});

test("listo y avisado lo dice con la hora del aviso", () => {
  assert.equal(rielDelPedido({ status: "READY", cobrado: false, avisado: "10:12" }, true).palabra, "Listo · avisado 10:12");
});

test("entregado sin cobrar pide atención; entregado y cobrado está hecho", () => {
  assert.equal(rielDelPedido({ status: "DELIVERED", cobrado: false }, true).tipo, "atencion");
  assert.equal(rielDelPedido({ status: "DELIVERED", cobrado: true }, true).tipo, "hecho");
  assert.equal(rielDelPedido({ status: "CANCELLED", cobrado: false }, true).tipo, "anulado");
});

test("una sola tecla: el verbo de siempre para avanzar", () => {
  assert.deepEqual(teclaDelPedido({ status: "PENDING", verbo: "Preparar", cobrado: false, avisoWa: null, avisado: null }), {
    tipo: "avanzar",
    verbo: "Preparar",
  });
});

test("listo sin avisar ofrece avisar; avisado (o sin teléfono) ofrece entregar", () => {
  const base = { status: "READY", verbo: null, cobrado: false };
  assert.deepEqual(teclaDelPedido({ ...base, avisoWa: "https://wa.me/x", avisado: null }), { tipo: "avisar" });
  assert.deepEqual(teclaDelPedido({ ...base, avisoWa: "https://wa.me/x", avisado: "10:12" }), { tipo: "entregar" });
  assert.deepEqual(teclaDelPedido({ ...base, avisoWa: null, avisado: null }), { tipo: "entregar" });
});

test("entregado sin cobrar ofrece cobrar; cerrado no ofrece nada", () => {
  assert.deepEqual(teclaDelPedido({ status: "DELIVERED", verbo: null, cobrado: false, avisoWa: null, avisado: null }), { tipo: "cobrar" });
  assert.equal(teclaDelPedido({ status: "DELIVERED", verbo: null, cobrado: true, avisoWa: null, avisado: null }), null);
});

test("los filtros de la URL: lo desconocido es sin filtro", () => {
  assert.deepEqual(leerFiltrosDelTablero(params("estado=listos&canal=pedido&q=%23478")), { estado: "listos", canal: "pedido", q: "#478" });
  assert.deepEqual(leerFiltrosDelTablero(params("estado=cualquiera&canal=telefono")), { estado: "abiertos", canal: null, q: "" });
});

test("los chips cuentan lo que muestran, con el canal aplicado", () => {
  const lista = [
    pedido({ id: "p1", status: "PENDING" }),
    pedido({ id: "p2", status: "CONFIRMED", canal: "COUNTER" }),
    pedido({ id: "p3", status: "PREPARING" }),
    pedido({ id: "p4", status: "READY" }),
    pedido({ id: "p5", status: "DELIVERED", cobrado: false, canal: "COUNTER" }),
  ];
  assert.deepEqual(conteosDelTablero(lista, null), { abiertos: 5, preparar: 2, preparando: 1, listos: 1, "a-cobrar": 1 });
  assert.deepEqual(conteosDelTablero(lista, "mostrador"), { abiertos: 2, preparar: 1, preparando: 0, listos: 0, "a-cobrar": 1 });
});

test("filtrar por estado, canal y búsqueda", () => {
  const lista = [
    pedido({ id: "p478", status: "PENDING", cliente: "Parrilla La Brasa", telefono: "11 5555-9901" }),
    pedido({ id: "p477", status: "READY", cliente: "Romina Ferreyra", canal: "COUNTER" }),
  ];
  assert.deepEqual(filtrarPedidos(lista, { estado: "listos", canal: null, q: "" }).map((p) => p.id), ["p477"]);
  assert.deepEqual(filtrarPedidos(lista, { estado: "abiertos", canal: "pedido", q: "" }).map((p) => p.id), ["p478"]);
  assert.deepEqual(filtrarPedidos(lista, { estado: "abiertos", canal: null, q: "#47" }).map((p) => p.id), ["p478", "p477"]);
  assert.deepEqual(filtrarPedidos(lista, { estado: "abiertos", canal: null, q: "brasa" }).map((p) => p.id), ["p478"]);
  assert.deepEqual(filtrarPedidos(lista, { estado: "abiertos", canal: null, q: "9901" }).map((p) => p.id), ["p478"]);
});

test("la búsqueda no distingue tildes ni mayúsculas", () => {
  assert.ok(coincide({ code: 1, cliente: "Lucía Benedetti" }, "LUCIA"));
  assert.ok(!coincide({ code: 1, cliente: "Lucía", telefono: "11" }, "11"), "dos dígitos no alcanzan para buscar por teléfono");
});

test("sin orden: el más nuevo primero; por entrega: los que tienen horario primero", () => {
  const a = pedido({ id: "p1", status: "PENDING", creado: "2026-09-24T10:00:00.000Z", horarioIso: "2026-09-24T21:00:00.000Z" });
  const b = pedido({ id: "p2", status: "PENDING", creado: "2026-09-24T12:00:00.000Z", horarioIso: null });
  const c = pedido({ id: "p3", status: "PENDING", creado: "2026-09-24T11:00:00.000Z", horarioIso: "2026-09-24T15:00:00.000Z" });
  assert.deepEqual(ordenarPedidos([a, b, c], null).map((p) => p.id), ["p2", "p3", "p1"]);
  assert.deepEqual(ordenarPedidos([a, b, c], { key: "entrega", direction: "asc" }).map((p) => p.id), ["p3", "p1", "p2"]);
  assert.deepEqual(ordenarPedidos([a, b, c], { key: "total", direction: "desc" }).length, 3);
});

test("en lote se agrupa por verbo y se avisa sólo a los listos con teléfono", () => {
  const l = loteDelTablero([
    pedido({ id: "p1", status: "PENDING", verbo: "Preparar" }),
    pedido({ id: "p2", status: "PENDING", verbo: "Preparar" }),
    pedido({ id: "p3", status: "PREPARING", verbo: "Marcar listo" }),
    pedido({ id: "p4", status: "READY", avisoWa: "https://wa.me/x" }),
    pedido({ id: "p5", status: "READY", avisoWa: null }),
    pedido({ id: "p6", status: "DELIVERED" }),
  ]);
  assert.deepEqual(l.avanzar, [
    { verbo: "Preparar", ids: ["p1", "p2"] },
    { verbo: "Marcar listo", ids: ["p3"] },
  ]);
  assert.deepEqual(l.avisar, ["p4"]);
});

test("el resumen del lote dice cuántos salieron y, si uno no, por qué", () => {
  assert.equal(resumenDelLote("Preparar", [{ code: 1, error: null }, { code: 2, error: null }]).texto, "2 pedidos quedaron en preparación.");
  assert.equal(resumenDelLote("Marcar listo", [{ code: 1, error: null }, { code: 2, error: null }]).texto, "2 pedidos quedaron listos.");
  const r = resumenDelLote("Marcar listo", [
    { code: 1, error: null },
    { code: 474, error: "El pedido ya había cambiado de estado en otra pantalla: la bandeja se actualizó." },
  ]);
  assert.equal(r.conError, true);
  assert.match(r.texto, /^1 pedido quedó listo; el #474 no: El pedido ya había cambiado/);
});

test("la línea del tablero: la plata por cobrar sólo para quien ve los números", () => {
  const lista = [
    pedido({ id: "p1", status: "READY", avisoWa: "https://wa.me/x", horario: { texto: "Retira hoy 18:00", esHoy: true }, total: 1000 }),
    pedido({ id: "p2", status: "PENDING", cobrado: true, total: 500 }),
  ];
  assert.deepEqual(lineaDelTablero(lista, true), { abiertos: 2, paraHoy: 1, sinAvisar: 1, porCobrar: 1000, tienda: null, listosDeAyer: 0 });
  assert.equal(lineaDelTablero(lista, false).porCobrar, null);
});

test("cuándo se tomó: la hora si es de hoy, «ayer», o el día corto", () => {
  assert.equal(cuandoDelPedido("2026-09-24", "11:40", "2026-09-24", "2026-09-23", "jue 24/09"), "11:40");
  assert.equal(cuandoDelPedido("2026-09-23", "18:02", "2026-09-24", "2026-09-23", "mié 23/09"), "ayer");
  assert.equal(cuandoDelPedido("2026-09-21", "09:00", "2026-09-24", "2026-09-23", "lun 21/09"), "lun 21/09");
});

test("el aviso de un paso dice cómo quedó el pedido", () => {
  assert.equal(quedoElPedido("Preparar", 478), "El pedido #478 quedó en preparación.");
  assert.equal(quedoElPedido("Marcar listo", 477), "El pedido #477 quedó listo.");
});

// ── Aviso de pedido nuevo (UAT MAGRA 16/10) ─────────────────────────────────

import { pedidosWebNuevos, textoDePedidosWebNuevos, puedeRefrescarLaBandeja, REFRESCO_DE_LA_BANDEJA_MS } from "./pedidos-core";

test("al abrir la bandeja lo que ya estaba no es «nuevo»: no avisa ni suena al entrar", () => {
  assert.deepEqual(pedidosWebNuevos(null, [{ id: "a", code: 10 }]), []);
});

test("en la vuelta siguiente avisa sólo los pedidos de la tienda que no estaban, por número", () => {
  const vistos = new Set(["a"]);
  assert.deepEqual(pedidosWebNuevos(vistos, [{ id: "c", code: 12 }, { id: "a", code: 10 }, { id: "b", code: 11 }]), [
    { id: "b", code: 11 },
    { id: "c", code: 12 },
  ]);
  assert.deepEqual(pedidosWebNuevos(new Set(["a", "b"]), [{ id: "a", code: 10 }]), [], "uno que se cerró no es nuevo");
});

test("el aviso dice el número del pedido nuevo, o cuántos y cuáles", () => {
  assert.equal(textoDePedidosWebNuevos([]), null);
  assert.equal(textoDePedidosWebNuevos([{ id: "b", code: 128 }]), "Entró un pedido nuevo de la tienda: #128");
  assert.equal(
    textoDePedidosWebNuevos([{ id: "b", code: 128 }, { id: "c", code: 129 }, { id: "d", code: 130 }]),
    "Entraron 3 pedidos nuevos de la tienda: #128, #129 y #130",
  );
});

test("la bandeja se refresca entre 30 y 60 s, sólo a la vista y sin interrumpir a quien escribe o tiene un diálogo", () => {
  assert.ok(REFRESCO_DE_LA_BANDEJA_MS >= 30_000 && REFRESCO_DE_LA_BANDEJA_MS <= 60_000);
  assert.equal(puedeRefrescarLaBandeja({ visible: true, escribiendo: false, dialogoAbierto: false }), true);
  assert.equal(puedeRefrescarLaBandeja({ visible: false, escribiendo: false, dialogoAbierto: false }), false, "pestaña escondida: no se le pega a la base");
  assert.equal(puedeRefrescarLaBandeja({ visible: true, escribiendo: true, dialogoAbierto: false }), false);
  assert.equal(puedeRefrescarLaBandeja({ visible: true, escribiendo: false, dialogoAbierto: true }), false);
});

// ── Pedido web que nadie vio (caso 1) y clienta que no retira (caso 4) ─────────────────────────
// Sábado 26/09 a las 10:25 (13:25 UTC): tres pedidos de la tienda sin tocar, el más viejo de las 10:00.
const SABADO = new Date("2026-09-26T13:25:00.000Z");

test("pedido web que nadie vio: cuántos de la tienda esperan y hace cuánto el más viejo", () => {
  const lista = [
    pedido({ id: "p1", status: "PENDING", creado: "2026-09-26T13:00:00.000Z" }),
    pedido({ id: "p2", status: "PENDING", creado: "2026-09-26T13:10:00.000Z" }),
    pedido({ id: "p3", status: "PENDING", creado: "2026-09-26T13:20:00.000Z" }),
    pedido({ id: "p4", status: "PREPARING", creado: "2026-09-26T12:00:00.000Z" }), // ya lo tocaron
    pedido({ id: "p5", status: "PENDING", canal: "COUNTER", creado: "2026-09-26T11:00:00.000Z" }), // del mostrador
  ];
  const t = pedidosDeLaTiendaEsperando(lista, SABADO);
  assert.deepEqual(t, { esperando: 3, minutos: 25, alerta: true });
  assert.equal(textoDeLaTiendaEsperando(t!), "3 de la tienda esperando · el más viejo hace 25 min");
  // La línea del tablero lo trae sólo con reloj (comercio).
  assert.deepEqual(lineaDelTablero(lista, false, { ahora: SABADO, hoy: "2026-09-26" }).tienda, t);
  assert.equal(lineaDelTablero(lista, false).tienda, null, "sin reloj (CH) no se cuenta");
});

test("pedido web que nadie vio: recién entrado no alarma; pasado el umbral provisional, sí", () => {
  const uno = [pedido({ id: "p1", status: "PENDING", creado: "2026-09-26T13:20:30.000Z" })];
  const t = pedidosDeLaTiendaEsperando(uno, SABADO)!;
  assert.equal(t.alerta, false);
  assert.equal(textoDeLaTiendaEsperando(t), "1 de la tienda esperando · hace 4 min");
  assert.equal(ESPERA_DE_LA_TIENDA_MIN, 15, "provisional a confirmar con Magra");
  const justo = pedidosDeLaTiendaEsperando([pedido({ id: "p1", status: "PENDING", creado: "2026-09-26T13:10:00.000Z" })], SABADO)!;
  assert.equal(justo.alerta, true, "a los 15 min ya es alerta");
  assert.equal(textoDeLaTiendaEsperando({ esperando: 2, minutos: 95 }), "2 de la tienda esperando · el más viejo hace 1 h 35 min");
  assert.equal(textoDeLaTiendaEsperando({ esperando: 1, minutos: 0 }), "1 de la tienda esperando · hace menos de 1 min");
  assert.equal(pedidosDeLaTiendaEsperando([], SABADO), null, "sin pedidos esperando no se dice nada");
});

test("clienta que no retira: listo desde un día anterior (en la zona del negocio), no el de hoy", () => {
  // Viernes 25/09 a las 22:30 de Argentina = sábado 01:30 UTC: es de AYER para el local.
  assert.equal(listoDesdeAyer({ status: "READY", creado: "2026-09-26T01:30:00.000Z" }, "2026-09-26"), true);
  assert.equal(listoDesdeAyer({ status: "READY", creado: "2026-09-26T12:00:00.000Z" }, "2026-09-26"), false, "listo de hoy");
  assert.equal(listoDesdeAyer({ status: "PREPARING", creado: "2026-09-20T12:00:00.000Z" }, "2026-09-26"), false, "sólo Listo");
  const lista = [
    pedido({ id: "p1", status: "READY", creado: "2026-09-24T15:00:00.000Z" }),
    pedido({ id: "p2", status: "READY", creado: "2026-09-25T15:00:00.000Z" }),
    pedido({ id: "p3", status: "READY", creado: "2026-09-26T12:00:00.000Z" }),
  ];
  assert.equal(lineaDelTablero(lista, false, { ahora: SABADO, hoy: "2026-09-26" }).listosDeAyer, 2);
  assert.equal(lineaDelTablero(lista, false).listosDeAyer, 0, "sin reloj no se cuenta");
});

// ── Doble pedido de la misma clienta (caso 8) ─────────────────────────────────

test("doble pedido: la misma clienta escrita distinto se marca en los dos pedidos", () => {
  const lista = [
    pedido({ id: "p127", status: "PENDING", telefono: "11 5555-0101" }),
    pedido({ id: "p131", status: "PREPARING", telefono: "+54 9 11 5555 0101", canal: "COUNTER" }),
    pedido({ id: "p132", status: "PENDING", telefono: "11 4444-0202" }),
  ];
  const otros = otrosPedidosDeLaClienta(lista);
  assert.deepEqual(otros.get("p127"), [131]);
  assert.deepEqual(otros.get("p131"), [127]);
  assert.equal(otros.has("p132"), false, "una clienta con un solo pedido no se marca");
  assert.equal(textoDeOtrosPedidos([127]), "Tiene otro pedido abierto (#127)");
  assert.equal(textoDeOtrosPedidos([127, 130]), "Tiene otros 2 pedidos abiertos (#127 y #130)");
  assert.equal(textoDeOtrosPedidos([]), null);
});

test("doble pedido: entregados, anulados y teléfonos a medias no cuentan", () => {
  const lista = [
    pedido({ id: "p1", status: "PENDING", telefono: "11 5555-0101" }),
    pedido({ id: "p2", status: "DELIVERED", telefono: "1155550101" }),
    pedido({ id: "p3", status: "CANCELLED", telefono: "1155550101" }),
    pedido({ id: "p4", status: "PENDING", telefono: "123" }),
    pedido({ id: "p5", status: "PENDING", telefono: "123" }),
    pedido({ id: "p6", status: "PENDING", telefono: null }),
    pedido({ id: "p7", status: "READY", telefono: null }),
  ];
  assert.equal(otrosPedidosDeLaClienta(lista).size, 0);
});
