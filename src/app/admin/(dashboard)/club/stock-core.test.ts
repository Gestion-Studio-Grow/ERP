// El stock del club contra el motor REAL sobre la demo: el inventario (estados, lo que falta y el WhatsApp para
// reponer), editar con el conteo (sin quedar a medias), el alta de producto y de plato, la baja y volver a activar,
// precios y rentabilidad (costo, % sobre costo y precio), y que recepción mira pero no toca.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { armarPrecios, armarProducto, armarStock, cuantasPedir, ejecutarStock, estadoDelProducto, leerCantidad, puedeTocarStock, textoStock } from "./stock-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; recep: Auth; duenio: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, recep: operadorDeLaDemo(e, "RECEPTION")!.auth, duenio: operadorDeLaDemo(e, "OWNER")!.auth };
};
const prod = (e: EstadoClub, nombre: string) => e.productos.find((p) => p.nombre === nombre)!;
const editar = (e: EstadoClub, nombre: string, cambios: Partial<Record<"nombre" | "precio" | "costo" | "minimo" | "conteo" | "codigo" | "codigoExterno", string>>) => {
  const p = prod(e, nombre);
  return {
    tipo: "editar" as const,
    productoId: p.id,
    nombre: p.nombre,
    precio: String(p.precio),
    costo: String(p.costo),
    minimo: String(p.minimo),
    conteo: p.stock == null ? "" : String(p.stock),
    codigo: p.codigo,
    codigoExterno: p.codigoExterno,
    ...cambios,
  };
};

test("leerCantidad: entero de 0 o más; vacío es null; lo demás no se lee", () => {
  assert.equal(leerCantidad(" 12 "), 12);
  assert.equal(leerCantidad("0"), 0);
  assert.equal(leerCantidad(""), null);
  for (const t of ["-1", "1.5", "doce", "1e3"]) assert.ok(Number.isNaN(leerCantidad(t)), t);
});

test("el inventario: cada producto con su estado; lo que falta (y cuánto pedir) va al WhatsApp de reposición", () => {
  const { e } = demo();
  const v = armarStock(e, "");
  assert.equal(v.total, e.productos.filter((p) => p.activo !== false).length);
  const fila = (n: string) => v.filas.find((f) => f.nombre === n)!;
  assert.equal(fila("Remera técnica del club").estado, "sin-stock");
  assert.equal(fila("Alquiler de pala").estado, "alquiler");
  assert.match(textoStock(fila("Alquiler de pala")), /^\d+ \(\d+ en uso\)$/);
  assert.equal(fila("Milanesa napolitana con papas").estado, "plato");
  assert.equal(textoStock(fila("Milanesa napolitana con papas")), "—");
  assert.equal(fila("Tubo de pelotas (3)").codigos, "BP-001 · 7790000000011");
  // Lo que falta: con stock contado, en el mínimo o abajo (ni alquiler ni platos), con lo que hay que pedir.
  const esperados = e.productos.filter((p) => p.activo !== false && !p.alquiler && !p.plato && p.stock != null && p.stock <= p.minimo);
  assert.ok(esperados.length >= 2, "la demo tiene faltantes");
  assert.deepEqual(v.faltantes.map((f) => f.nombre), esperados.map((p) => p.nombre));
  const remera = v.faltantes.find((f) => f.nombre === "Remera técnica del club")!;
  assert.equal(remera.pedir, 10, "hasta el doble del mínimo (5 × 2 − 0)");
  assert.equal(cuantasPedir({ ...prod(e, "Agua 500 ml"), stock: 30, minimo: 10 }), 1, "al menos 1");
  for (const f of v.faltantes) assert.ok(["reponer", "sin-stock"].includes(fila(f.nombre).estado));
  assert.match(v.pedirPorWhatsApp!, /^https:\/\/wa\.me\/\?text=/);
  assert.match(decodeURIComponent(v.pedirPorWhatsApp!), /Necesitamos reponer: .*Remera técnica del club \(10\)/);
  assert.equal(v.sinControlar, 0);
  assert.deepEqual(v.dadosDeBaja, []);
  // El buscador: nombre, rubro o código.
  assert.deepEqual(armarStock(e, "bp-002").filas.map((f) => f.nombre), ["Agua 500 ml"]);
  assert.ok(armarStock(e, "bebidas").filas.every((f) => f.categoria === "Bebidas"));
});

test("stock sin controlar: dice «Sin controlar», no figura como faltante y cuenta para avisar que falta contar", () => {
  const { e, duenio } = demo();
  const p = prod(e, "Remera técnica del club");
  assert.ok(M.ajustarStock(e, p.id, null, duenio, AHORA).ok);
  assert.equal(estadoDelProducto(p), "sin-controlar");
  const v = armarStock(e, "");
  assert.equal(v.filas.find((f) => f.id === p.id)!.estado, "sin-controlar");
  assert.equal(textoStock(v.filas.find((f) => f.id === p.id)!), "Sin controlar");
  assert.ok(!v.faltantes.some((f) => f.id === p.id));
  assert.equal(v.sinControlar, 1);
  // Un día sin nada contado (la jornada real arranca así): ningún faltante y ningún link.
  for (const x of e.productos) if (!x.plato) x.stock = null;
  const blanco = armarStock(e, "");
  assert.deepEqual(blanco.faltantes, []);
  assert.equal(blanco.pedirPorWhatsApp, null);
});

test("editar con el conteo: guarda precio, costo, mínimo y el stock contado; vacío = sin controlar", () => {
  const { e, duenio } = demo();
  const d = ejecutarStock(e, editar(e, "Muñequera", { precio: "6.500", costo: "3000", minimo: "8", conteo: "20" }), AHORA, duenio);
  assert.equal(d.ok, true, d.mensaje);
  const p = prod(e, "Muñequera");
  assert.deepEqual([p.precio, p.costo, p.minimo, p.stock], [6500, 3000, 8, 20]);
  assert.match(d.mensaje, /^Muñequera guardado\. Stock: \d+ → 20\.$/);
  assert.match(e.log[0].texto, /ajustó el stock de Muñequera: \d+ → 20/);
  const d2 = ejecutarStock(e, editar(e, "Muñequera", { conteo: "" }), AHORA, duenio);
  assert.equal(d2.mensaje, "Muñequera guardado. Stock: 20 → sin controlar.");
  assert.equal(p.stock, null);
  // Sin cambio en el conteo, no se ajusta.
  assert.equal(ejecutarStock(e, editar(e, "Muñequera", { nombre: "Muñequera BP" }), AHORA, duenio).mensaje, "Muñequera BP guardado.");
});

test("sin tocar el conteo no se ajusta: lo vendido con la ficha abierta no se pisa", () => {
  const { e, duenio } = demo();
  const accion = { ...editar(e, "Agua 500 ml", { precio: "2200" }), conteo: null };
  const p = prod(e, "Agua 500 ml");
  p.stock = p.stock! - 2; // una venta en el mostrador mientras el dueño cambia el precio
  const quedan = p.stock;
  const d = ejecutarStock(e, accion, AHORA, duenio);
  assert.equal(d.mensaje, "Agua 500 ml guardado.");
  assert.equal(p.stock, quedan);
  assert.equal(p.precio, 2200);
});

test("editar no queda a medias: si algo está mal, no cambia nada (ni el precio ni el stock)", () => {
  const { e, duenio } = demo();
  const p = prod(e, "Overgrip");
  const antes = JSON.stringify(p);
  for (const [cambios, mensaje] of [
    [{ conteo: "-3" }, /Stock actual/],
    [{ conteo: "dos" }, /Stock actual/],
    [{ minimo: "-1" }, /mínimo/],
    [{ costo: "-5" }, /costo/],
    [{ precio: "0", conteo: "99" }, /precio tiene que ser mayor a cero/],
    [{ codigo: "BP-001", conteo: "99" }, /Ese código ya está en otro producto/],
  ] as const) {
    const d = ejecutarStock(e, editar(e, "Overgrip", cambios), AHORA, duenio);
    assert.equal(d.ok, false, JSON.stringify(cambios));
    assert.match(d.mensaje, mensaje);
    assert.equal(JSON.stringify(p), antes, `no tocó nada con ${JSON.stringify(cambios)}`);
  }
});

test("un plato no lleva stock: se edita el precio y el conteo no se mira", () => {
  const { e, duenio } = demo();
  const d = ejecutarStock(e, editar(e, "Milanesa napolitana con papas", { precio: "15000", conteo: "7" }), AHORA, duenio);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(prod(e, "Milanesa napolitana con papas").stock, null);
  assert.equal(prod(e, "Milanesa napolitana con papas").precio, 15000);
});

test("alta de producto y de plato (sin stock); sin precio o con código repetido, no", () => {
  const { e, duenio } = demo();
  const base = { tipo: "alta" as const, nombre: "Grip pro", categoria: "Accesorios", precio: "7.000", costo: "3.500", minimo: "4", stock: "12", codigo: "BP-099", codigoExterno: "", plato: false };
  assert.equal(ejecutarStock(e, { ...base, precio: "" }, AHORA, duenio).mensaje, "Poné el precio de venta.");
  assert.equal(ejecutarStock(e, { ...base, codigo: "bp-001" }, AHORA, duenio).mensaje, "Ese código ya está en otro producto.");
  const d = ejecutarStock(e, base, AHORA, duenio);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Listo: Grip pro ya está en los productos, a $ 7.000.");
  const p = M.producto(e, d.productoId!)!;
  assert.deepEqual([p.categoria, p.precio, p.costo, p.minimo, p.stock], ["Accesorios", 7000, 3500, 4, 12]);
  const plato = ejecutarStock(e, { ...base, nombre: "Tostado de jamón y queso", categoria: "", codigo: "", stock: "50", plato: true }, AHORA, duenio);
  assert.equal(plato.ok, true, plato.mensaje);
  const t = M.producto(e, plato.productoId!)!;
  assert.deepEqual([t.categoria, t.stock, t.plato], ["Cocina", null, true]);
  assert.equal(armarProducto(e, t.id)!.estado, "plato");
});

test("baja y volver a activar: deja de venderse y aparece en «dados de baja»", () => {
  const { e, duenio } = demo();
  const p = prod(e, "Gaseosa 500 ml");
  const d = ejecutarStock(e, { tipo: "baja", productoId: p.id, activo: false }, AHORA, duenio);
  assert.equal(d.mensaje, "Gaseosa 500 ml dado de baja: ya no se vende.");
  const v = armarStock(e, "");
  assert.ok(!v.filas.some((f) => f.id === p.id));
  assert.deepEqual(v.dadosDeBaja, [{ id: p.id, nombre: "Gaseosa 500 ml" }]);
  assert.equal(M.buscarProductos(e, "gaseosa", { soloVendibles: true }).length, 0, "no se vende");
  assert.equal(ejecutarStock(e, { tipo: "baja", productoId: p.id, activo: true }, AHORA, duenio).mensaje, "Gaseosa 500 ml está activo otra vez.");
  assert.equal(armarStock(e, "").dadosDeBaja.length, 0);
});

test("precios y rentabilidad: 7 días, margen por producto con su tono; costo, % sobre costo y precio", () => {
  const { e, duenio } = demo();
  const v = armarPrecios(e, "", AHORA);
  assert.equal(v.periodo, "11/10 al 17/10");
  const r = M.rentabilidad(e, { desde: "2026-10-11", hasta: HOY });
  assert.equal(v.facturado, r.facturado);
  assert.equal(v.ganancia, r.ganancia);
  assert.ok(v.facturado > 0, "la demo vendió en la semana");
  const agua = v.filas.find((f) => f.nombre === "Agua 500 ml")!;
  assert.deepEqual([agua.costo, agua.precio, agua.margen, agua.margenPct, agua.markup, agua.tono], [700, 2000, 1300, 65, 186, "bien"]);
  assert.equal(v.filas.find((f) => f.nombre === "Alquiler de pala")!.markup, null, "sin costo no hay % sobre costo");
  assert.deepEqual(armarPrecios(e, "agua", AHORA).filas.map((f) => f.nombre), ["Agua 500 ml"]);

  const id = prod(e, "Agua 500 ml").id;
  assert.equal(ejecutarStock(e, { tipo: "precio", productoId: id, campo: "markup", valor: "100" }, AHORA, duenio).mensaje, "Agua 500 ml: precio $ 1.400 · margen 50 %.");
  assert.equal(ejecutarStock(e, { tipo: "precio", productoId: id, campo: "costo", valor: "1.000" }, AHORA, duenio).ok, true);
  assert.equal(ejecutarStock(e, { tipo: "precio", productoId: id, campo: "precio", valor: "$ 2.500" }, AHORA, duenio).mensaje, "Agua 500 ml: precio $ 2.500 · margen 60 %.");
  assert.equal(armarPrecios(e, "agua", AHORA).filas[0].tono, "bien");
  assert.equal(ejecutarStock(e, { tipo: "precio", productoId: id, campo: "precio", valor: "" }, AHORA, duenio).mensaje, "Ese campo no puede quedar vacío: no se cambió nada.");
  assert.equal(ejecutarStock(e, { tipo: "precio", productoId: id, campo: "precio", valor: "0" }, AHORA, duenio).ok, false);
  const pala = prod(e, "Alquiler de pala").id;
  assert.match(ejecutarStock(e, { tipo: "precio", productoId: pala, campo: "markup", valor: "50" }, AHORA, duenio).mensaje, /necesita costo/);
  assert.equal(prod(e, "Alquiler de pala").precio, 5000, "no cambió");
});

test("recepción mira el stock pero no lo toca: el motor dice que no y no cambia nada", () => {
  const { e, recep, duenio } = demo();
  assert.equal(puedeTocarStock(e, duenio.usuarioId), true);
  assert.equal(puedeTocarStock(e, recep.usuarioId), false);
  assert.equal(puedeTocarStock(e, undefined), false);
  const antes = JSON.stringify(e.productos);
  for (const a of [
    editar(e, "Agua 500 ml", { conteo: "1" }),
    { tipo: "baja" as const, productoId: prod(e, "Agua 500 ml").id, activo: false },
    { tipo: "precio" as const, productoId: prod(e, "Agua 500 ml").id, campo: "precio" as const, valor: "1" },
    { tipo: "alta" as const, nombre: "X", categoria: "", precio: "10", costo: "", minimo: "", stock: "", codigo: "", codigoExterno: "", plato: false },
  ]) {
    const d = ejecutarStock(e, a, AHORA, recep);
    assert.equal(d.ok, false, a.tipo);
    assert.match(d.mensaje, /no tiene permiso/);
  }
  assert.equal(JSON.stringify(e.productos), antes);
});
