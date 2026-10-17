// Tests de la tienda del turnero (núcleo + demo local) y del modo «pedido por WhatsApp» (?modo=pedido):
// public/previews/breakpoint/turnero/{dominio/nucleo.mjs, local.mjs, tienda.mjs}.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as localMod from "../../../../public/previews/breakpoint/turnero/local.mjs";
import * as tiendaMod from "../../../../public/previews/breakpoint/turnero/tienda.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any -- módulos JS planos (los carga el navegador sin build) */
const L: any = localMod;
const T: any = tiendaMod;

test("tienda (demo): catálogo sin costos; el pedido le llega al club en vivo con su código T- y el mensaje para WhatsApp", async () => {
  const srv = L.crearServidorDemo();
  const club: any[] = [];
  const baja = srv.suscribir("club", "/api/staff/eventos", (tipo: string, datos: any) => club.push({ tipo, datos }));
  const cat = await srv.atender({ tab: "t1", ruta: "/api/tienda/catalogo" });
  assert.equal(cat.status, 200);
  const tubo = cat.productos.find((p: any) => /Tubo/.test(p.nombre));
  const grip = cat.productos.find((p: any) => /Overgrip/.test(p.nombre));
  assert.ok(tubo && grip, "tubo y overgrip en la tienda");
  assert.ok(cat.productos.every((p: any) => !("costo" in p) && !("stock" in p)), "sin costos ni stock exacto");
  const v0 = srv.turnero.version();
  const r = await srv.atender({ tab: "t1", metodo: "POST", ruta: "/api/tienda/pedidos", cuerpo: { items: [{ productoId: tubo.id, cant: 1 }, { productoId: grip.id, cant: 2 }], nombre: "Juan", tel: "11 5555 1234" } });
  assert.equal(r.status, 201);
  assert.match(r.pedido.codigo, /^T-[A-Z2-9]{4}$/);
  assert.equal(r.pedido.total, tubo.precio + 2 * grip.precio);
  assert.match(r.mensaje, new RegExp(r.pedido.codigo));
  assert.match(r.mensaje, /Juan/);
  assert.equal(srv.turnero.version(), v0 + 1, "sube la versión (la foto del bus lo lleva)");
  const ev = club.find((e) => e.tipo === "pedido");
  assert.ok(ev, "el club recibe el evento «pedido»");
  assert.equal(ev.datos.pedido.codigo, r.pedido.codigo);
  assert.equal(ev.datos.pedido.estado, "pendiente");
  const est = await srv.atender({ tab: "club", ruta: "/api/staff/estado" });
  assert.ok(est.estado.pedidos.some((p: any) => p.codigo === r.pedido.codigo), "queda en el estado del club (snapshot)");
  baja();
  srv.cerrar();
});

test("tienda: sin nombre, vacío, producto que no es de la tienda o celular mal cargado → motivo claro, sin evento", async () => {
  const srv = L.crearServidorDemo();
  const club: any[] = [];
  srv.suscribir("club", "/api/staff/eventos", (tipo: string) => club.push(tipo));
  const { productos } = await srv.atender({ tab: "t", ruta: "/api/tienda/catalogo" });
  const item = [{ productoId: productos[0].id, cant: 1 }];
  const pedir = (cuerpo: any) => srv.atender({ tab: "t", metodo: "POST", ruta: "/api/tienda/pedidos", cuerpo });
  assert.match((await pedir({ items: item, nombre: " " })).motivo, /nombre/);
  assert.match((await pedir({ items: [], nombre: "Ana" })).motivo, /vacío/);
  assert.match((await pedir({ items: [{ productoId: "no-existe", cant: 1 }], nombre: "Ana" })).motivo, /tienda/);
  assert.match((await pedir({ items: item, nombre: "Ana", tel: "123" })).motivo, /celular/);
  assert.match((await pedir({ items: "nada", nombre: "Ana" })).motivo, /vacío/, "un cuerpo raro no rompe");
  assert.equal((await pedir({ items: item, nombre: "Ana", tel: "123" })).status, 400);
  assert.ok(!club.includes("pedido"), "nada llegó al club");
  srv.cerrar();
});

test("modo pedido: club en blanco (sin turnos de ejemplo), horarios y precios de referencia, tienda local", async () => {
  // Sin catálogo en el link no hay tienda (nada de productos ni precios de ejemplo).
  const sinCat = L.crearLocalPedido();
  assert.equal((await sinCat.api("/api/tienda/catalogo")).productos.length, 0);
  sinCat.cerrar();
  // Con el link del club: sus tarifas y sólo sus productos, a sus precios.
  const t = L.crearLocalPedido({ tarifas: [{ nombre: "Valle", desde: 480, hasta: 1560, precioHora: 30000 }], catalogo: { p1: 13000, p4: 5000 } });
  const cfg = await t.api("/api/turnero/config");
  assert.ok(cfg.club && cfg.dias.length > 0);
  const fecha = cfg.dias[1].fecha;
  const d = await t.api(`/api/turnero/disponibilidad?fecha=${fecha}&duracion=90`);
  assert.equal(d.ok, true);
  assert.ok(d.slots.length > 0 && d.slots.every((s: any) => s.precio > 0), "horarios con precio");
  // Sin reservas de ejemplo: cada cancha tiene su primer horario del día libre.
  const canchas = new Set(d.slots.map((s: any) => s.canchaId));
  assert.equal(canchas.size, cfg.canchas.length, "todas las canchas con horarios (no hay turnos de la demo)");
  assert.ok(d.slots.every((s: any) => s.precio === 45000), "precio del club: 90′ a $30.000 la hora");
  const { productos } = await t.api("/api/tienda/catalogo");
  assert.deepEqual(productos.map((x: any) => [x.id, x.precio]).sort(), [["p1", 13000], ["p4", 5000]]);
  const r = await t.api("/api/tienda/pedidos", { metodo: "POST", cuerpo: { items: [{ productoId: productos[0].id, cant: 1 }], nombre: "Sol" } });
  assert.equal(r.ok, true);
  assert.match(r.pedido.codigo, /^T-/);
  t.cerrar();
});

test("tienda.mjs: link de WhatsApp con y sin número, y catálogo agrupado por categoría", () => {
  assert.equal(T.linkPedido("5491100000000", "Hola & chau"), "https://wa.me/5491100000000?text=Hola%20%26%20chau");
  assert.equal(T.linkPedido("", "x"), "https://wa.me/?text=x");
  const g = T.porCategoria([{ id: "a", categoria: "Pelotas" }, { id: "b", categoria: "Bebidas" }, { id: "c", categoria: "Pelotas" }]);
  assert.deepEqual(g.map(([c, ps]: [string, any[]]) => [c, ps.map((p) => p.id)]), [["Pelotas", ["a", "c"]], ["Bebidas", ["b"]]]);
});
