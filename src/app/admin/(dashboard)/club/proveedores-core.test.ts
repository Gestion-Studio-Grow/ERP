// Los proveedores del club contra el motor REAL sobre la demo: la lista con lo que les debemos (el mismo total que el
// Tablero), el alta y la edición, la cuenta con el saldo corrido y sus remitos, el remito (lector, buscador, suma
// stock y deuda), el pago con PIN (efectivo sale de la caja) y los permisos de recepción.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub, Proveedor } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import { armarTablero } from "./tablero-core";
import {
  armarFichaProveedor,
  armarProveedores,
  armarRemito,
  cambiarLinea,
  candidatosParaRemito,
  ejecutarProveedores,
  leerParaElRemito,
  permisosProveedores,
  quitarDelRemito,
  remitoVacio,
  sumarAlRemito,
  type BorradorRemito,
  type VistaFichaProveedor,
} from "./proveedores-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; recep: Auth; duenio: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, recep: operadorDeLaDemo(e, "RECEPTION")!.auth, duenio: operadorDeLaDemo(e, "OWNER")!.auth };
};
const prod = (e: EstadoClub, nombre: string) => e.productos.find((p) => p.nombre === nombre)!;
const pv = (e: EstadoClub, nombre: string) => (e.proveedores as Proveedor[]).find((p) => p.nombre === nombre)!;
const ficha = (e: EstadoClub, id: string, auth: Auth) => armarFichaProveedor(e, id, auth) as VistaFichaProveedor;

test("la lista: lo que le debemos a cada uno, los que deben primero, y el total igual al del Tablero", () => {
  const { e } = demo();
  const v = armarProveedores(e);
  assert.equal(v.filas.length, 4);
  assert.equal(v.filas[0].nombre, "Pádel Sur Insumos", "al que más le debemos, primero ($ 229.200)");
  for (const f of v.filas) assert.equal(f.deuda, M.deudaConProveedor(e, f.id));
  const deudas = v.filas.map((f) => f.deuda);
  assert.deepEqual(deudas, [...deudas].sort((a, b) => b - a));
  assert.equal(v.deudaTotal, M.kpis(e, HOY, AHORA).deudaProveedores);
  assert.ok(v.deudaTotal > 0);
  const tablero = armarTablero(e, AHORA).indicadores.find((k) => k.etiqueta === "Le debemos a proveedores")!;
  assert.equal(tablero.valor, M.pesos(v.deudaTotal), "el mismo número que ve el dueño en el Tablero");
});

test("la ficha: la cuenta con el saldo corrido (remitos suman, pagos restan) y los remitos con lo que trajo cada uno", () => {
  const { e, duenio } = demo();
  const id = pv(e, "Distribuidora Ezeiza Bebidas").id;
  const f = ficha(e, id, duenio);
  assert.equal(f.saldo, M.deudaConProveedor(e, id));
  assert.equal(f.movimientos.length, 3, "dos remitos y un pago");
  assert.deepEqual(f.movimientos.map((m) => m.concepto), ["Remito 0001-00004512", "Pago (Transferencia) — Rober", "Remito 0001-00004580"]);
  assert.equal(f.movimientos[1].haber, 100000);
  assert.equal(f.movimientos.at(-1)!.saldo, f.saldo);
  assert.equal(f.movimientos[0].cuando, "12/10 10:30");
  assert.equal(f.remitos[0].numero, "0001-00004580", "el más nuevo primero");
  assert.deepEqual(f.remitos[1].lineas[0], { nombre: "Agua 500 ml", cant: 48, costo: 700, subtotal: 33600 });
  assert.equal(f.remitos[1].total, f.remitos[1].lineas.reduce((s, l) => s + l.subtotal, 0));
  assert.equal(armarFichaProveedor(e, "no-existe", duenio), null);
});

test("alta y edición: sin repetir nombre ni dejarlo vacío (el nombre queda como estaba)", () => {
  const { e, duenio } = demo();
  assert.equal(ejecutarProveedores(e, { tipo: "alta", nombre: "pádel sur insumos", rubro: "", cuit: "", tel: "" }, AHORA, duenio).mensaje, "Ya hay un proveedor con ese nombre.");
  const d = ejecutarProveedores(e, { tipo: "alta", nombre: "Hielo Express", rubro: "Bebidas", cuit: "30-11111111-1", tel: "11 4444-5555" }, AHORA, duenio);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Listo: Hielo Express ya es proveedor del club.");
  const nuevo = M.proveedor(e, d.proveedorId!)!;
  assert.deepEqual([nuevo.rubro, nuevo.cuit, nuevo.tel], ["Bebidas", "30-11111111-1", "11 4444-5555"]);
  const editar = { tipo: "editar" as const, proveedorId: nuevo.id, nombre: "Hielo Express SRL", rubro: "Hielo", cuit: "30-11111111-1", tel: "" };
  assert.equal(ejecutarProveedores(e, editar, AHORA, duenio).mensaje, "Datos de Hielo Express SRL guardados.");
  assert.equal(nuevo.rubro, "Hielo");
  assert.equal(ejecutarProveedores(e, { ...editar, nombre: "Carnicería Don Tito" }, AHORA, duenio).mensaje, "Ya hay otro proveedor con ese nombre.");
  assert.equal(ejecutarProveedores(e, { ...editar, nombre: "  " }, AHORA, duenio).mensaje, "El nombre no puede quedar vacío.");
  assert.equal(nuevo.nombre, "Hielo Express SRL", "no quedó vacío");
});

test("el remito en pantalla: el lector y el buscador suman de a 1; se cambia cantidad y costo; se saca una línea", () => {
  const { e } = demo();
  let b: BorradorRemito = remitoVacio(e);
  assert.equal(b.proveedorId, "pv1", "arranca con el primer proveedor");
  const r1 = leerParaElRemito(e, b, "7790000000028");
  assert.ok(r1.ok);
  assert.equal(r1.mensaje, "+1 Agua 500 ml");
  b = r1.borrador;
  const r2 = leerParaElRemito(e, b, "bp-002");
  assert.ok(r2.ok);
  b = r2.borrador;
  assert.deepEqual(b.lineas, [{ productoId: prod(e, "Agua 500 ml").id, cant: "2", costo: "700" }]);
  assert.equal(leerParaElRemito(e, b, "999").ok, false);
  assert.match((leerParaElRemito(e, b, "999") as { mensaje: string }).mensaje, /no está cargado en ningún producto/);
  const plato = sumarAlRemito(e, b, prod(e, "Milanesa napolitana con papas").id);
  assert.equal(plato.ok, false);
  assert.match(plato.mensaje, /es un plato/);
  assert.deepEqual(candidatosParaRemito(e, "milanesa"), [], "los platos no aparecen para el remito");
  assert.deepEqual(candidatosParaRemito(e, ""), []);
  const tubo = candidatosParaRemito(e, "tubo")[0];
  assert.equal(tubo.nombre, "Tubo de pelotas (3)");
  b = (sumarAlRemito(e, b, tubo.id) as { borrador: BorradorRemito }).borrador;
  b = cambiarLinea(b, tubo.id, "cant", "24");
  b = cambiarLinea(b, tubo.id, "costo", "8.000");
  let v = armarRemito(e, b);
  assert.deepEqual(v.lineas.map((l) => [l.nombre, l.subtotal]), [["Agua 500 ml", 1400], ["Tubo de pelotas (3)", 192000]]);
  assert.equal(v.total, 193400);
  b = cambiarLinea(b, tubo.id, "cant", "x");
  v = armarRemito(e, b);
  assert.equal(v.lineas[1].subtotal, null, "lo mal tipeado no suma");
  assert.equal(v.total, 1400);
  b = quitarDelRemito(b, tubo.id);
  assert.equal(b.lineas.length, 1);
});

test("un producto sin contar no entra por remito: lo dice claro (el motor diría «no lleva stock»)", () => {
  const { e, duenio } = demo();
  const agua = prod(e, "Agua 500 ml");
  assert.ok(M.ajustarStock(e, agua.id, null, duenio, AHORA).ok);
  const r = sumarAlRemito(e, remitoVacio(e), agua.id);
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /todavía no tiene el stock contado/);
  // Si quedó en un borrador de antes, registrar tampoco: el mismo mensaje y nada cambia.
  const deuda = M.deudaConProveedor(e, "pv1");
  const d = ejecutarProveedores(e, { tipo: "remito", borrador: { proveedorId: "pv1", numero: "0001-1", lineas: [{ productoId: agua.id, cant: "5", costo: "700" }] } }, AHORA, duenio);
  assert.equal(d.ok, false);
  assert.match(d.mensaje, /todavía no tiene el stock contado/);
  assert.equal(M.deudaConProveedor(e, "pv1"), deuda);
});

test("registrar el remito (también recepción): suma stock, deja el costo nuevo y la deuda; no se repite el número", () => {
  const { e, recep, duenio } = demo();
  const agua = prod(e, "Agua 500 ml");
  const [stock, deuda] = [agua.stock!, M.deudaConProveedor(e, "pv1")];
  const b: BorradorRemito = { proveedorId: "pv1", numero: "0001-00004600", lineas: [{ productoId: agua.id, cant: "24", costo: "750" }] };
  assert.match(ejecutarProveedores(e, { tipo: "remito", borrador: { ...b, lineas: [{ ...b.lineas[0], cant: "0" }] } }, AHORA, recep).mensaje, /cantidad de Agua 500 ml/);
  assert.match(ejecutarProveedores(e, { tipo: "remito", borrador: { ...b, lineas: [{ ...b.lineas[0], costo: "" }] } }, AHORA, recep).mensaje, /costo de Agua 500 ml/);
  assert.equal(ejecutarProveedores(e, { tipo: "remito", borrador: { ...b, numero: " " } }, AHORA, recep).mensaje, "Poné el número de remito.");
  assert.equal(ejecutarProveedores(e, { tipo: "remito", borrador: { ...b, lineas: [] } }, AHORA, recep).mensaje, "El remito no tiene productos.");
  assert.equal(ejecutarProveedores(e, { tipo: "remito", borrador: { ...b, proveedorId: "" } }, AHORA, recep).mensaje, "Elegí el proveedor.");
  assert.equal(agua.stock, stock, "nada cambió todavía");
  const d = ejecutarProveedores(e, { tipo: "remito", borrador: b }, AHORA, recep);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Remito 0001-00004600 de Distribuidora Ezeiza Bebidas cargado: $ 18.000. Ya suma al stock.");
  assert.equal(agua.stock, stock + 24);
  assert.equal(agua.costo, 750);
  assert.equal(M.deudaConProveedor(e, "pv1"), deuda + 18000);
  assert.equal(armarProveedores(e).deudaTotal, M.kpis(e, HOY, AHORA).deudaProveedores, "el Tablero lo ve igual");
  assert.match(ejecutarProveedores(e, { tipo: "remito", borrador: b }, AHORA, duenio).mensaje, /ya está cargado/);
  const f = ficha(e, "pv1", duenio);
  assert.equal(f.remitos[0].numero, "0001-00004600");
  assert.equal(f.remitos[0].cargo, "Lu (recepción tarde)");
});

test("pagar: con PIN, nunca de más; en efectivo sale de la caja, por transferencia queda como egreso por ese medio", () => {
  const { e, duenio } = demo();
  const debe = M.deudaConProveedor(e, "pv2");
  const pagar = (medio: "efectivo" | "transferencia", monto: string, pin = duenio.pin!) => ejecutarProveedores(e, { tipo: "pagar", proveedorId: "pv2", medio, monto, pin }, AHORA, duenio);
  assert.equal(pagar("efectivo", "1000", "").mensaje, "Poné tu PIN: el pago queda a tu nombre.");
  assert.equal(pagar("efectivo", "1000", "99").mensaje, "PIN incorrecto.");
  assert.equal(pagar("efectivo", "").mensaje, "Poné cuánto le pagás.");
  assert.equal(pagar("efectivo", "0").mensaje, "El monto tiene que ser mayor a cero.");
  assert.match(pagar("efectivo", String(debe + 1)).mensaje, /no se puede pagar de más/);
  const caja = M.resumenCaja(e, M.diaDeCaja(e, AHORA.fecha, AHORA.min));
  const d = pagar("efectivo", "10.000");
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, `Pago de $ 10.000 a Pádel Sur Insumos en efectivo: sale del cajón y queda en la caja del día. Le debemos ${M.pesos(debe - 10000)}.`);
  const despues = M.resumenCaja(e, M.diaDeCaja(e, AHORA.fecha, AHORA.min));
  assert.equal(despues.efectivoEsperado, caja.efectivoEsperado - 10000, "sale del cajón");
  const t = pagar("transferencia", String(debe - 10000));
  assert.equal(t.ok, true, t.mensaje);
  assert.match(t.mensaje, /por transferencia\. Le debemos \$ 0\.$/);
  assert.equal(M.resumenCaja(e, M.diaDeCaja(e, AHORA.fecha, AHORA.min)).efectivoEsperado, despues.efectivoEsperado, "la transferencia no toca el efectivo");
  const f = ficha(e, "pv2", duenio);
  assert.equal(f.saldo, 0);
  assert.deepEqual(f.movimientos.slice(-2).map((m) => m.concepto), ["Pago (Efectivo) — Rober", "Pago (Transferencia) — Rober"]);
  assert.equal(armarProveedores(e).filas.find((x) => x.id === "pv2")!.deuda, 0);
});

test("recepción: carga remitos, pero no ve las cuentas, no da de alta, no edita ni paga", () => {
  const { e, recep, duenio } = demo();
  assert.deepEqual(permisosProveedores(e, recep.usuarioId), { ver: false, pagar: false, remito: true });
  assert.deepEqual(permisosProveedores(e, duenio.usuarioId), { ver: true, pagar: true, remito: true });
  assert.deepEqual(permisosProveedores(e, undefined), { ver: false, pagar: false, remito: false });
  const r = armarFichaProveedor(e, "pv1", recep);
  assert.ok(r && "motivo" in r && /no tiene permiso/.test(r.motivo));
  const antes = JSON.stringify([e.proveedores, e.pagosProveedor, e.caja]);
  for (const a of [
    { tipo: "alta" as const, nombre: "Nuevo", rubro: "", cuit: "", tel: "" },
    { tipo: "editar" as const, proveedorId: "pv1", nombre: "Otro nombre", rubro: "", cuit: "", tel: "" },
    { tipo: "pagar" as const, proveedorId: "pv1", medio: "efectivo" as const, monto: "1000", pin: recep.pin! },
  ]) {
    const d = ejecutarProveedores(e, a, AHORA, recep);
    assert.equal(d.ok, false, a.tipo);
    assert.match(d.mensaje, /no tiene permiso/);
  }
  assert.equal(JSON.stringify([e.proveedores, e.pagosProveedor, e.caja]), antes);
});

test("Tanda 2 · remito con «Vence»: la fecha de pago queda en el remito, el dueño ve «Mañana vence $X a …» en su bandeja y en la ficha dice «vence el»", async () => {
  const { bandejaDelDuenio, bandejaDelMostrador } = await import("./bandeja-core");
  const { e, recep, duenio } = demo();
  const agua = prod(e, "Agua 500 ml");
  const manana = M.sumarDias(HOY, 1);
  assert.equal(remitoVacio(e).vence, "", "arranca sin fecha");
  const b: BorradorRemito = { proveedorId: "pv1", numero: "0001-00004700", lineas: [{ productoId: agua.id, cant: "10", costo: "800" }], vence: manana };
  assert.match(ejecutarProveedores(e, { tipo: "remito", borrador: { ...b, vence: "18/10" } }, AHORA, recep).mensaje, /^La fecha de pago no se entiende/);
  const d = ejecutarProveedores(e, { tipo: "remito", borrador: b }, AHORA, recep);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Remito 0001-00004700 de Distribuidora Ezeiza Bebidas cargado: $ 8.000. Ya suma al stock. Se paga hasta el 18/10: el dueño lo ve en su Tablero cuando se acerca.");
  const remito = (e.remitos as { numero: string; vence?: string }[]).find((r) => r.numero === "0001-00004700")!;
  assert.equal(remito.vence, manana);
  const alerta = bandejaDelDuenio(e, AHORA).items.find((i) => i.alerta.tipo === "vencePago");
  assert.ok(alerta, "la alerta del dueño");
  assert.equal(alerta.texto, "Mañana vence el pago de $ 8.000 a Distribuidora Ezeiza Bebidas (remito 0001-00004700).");
  assert.ok(!bandejaDelMostrador(e, AHORA).items.some((i) => i.alerta.tipo === "vencePago"), "la recepción no la ve");
  assert.equal(ficha(e, "pv1", duenio).remitos[0].vence, "vence el 18/10");
  // Sin fecha, como siempre: sin alerta y sin «vence».
  const sin = ejecutarProveedores(e, { tipo: "remito", borrador: { ...b, numero: "0001-00004701", vence: "" } }, AHORA, recep);
  assert.equal(sin.mensaje, "Remito 0001-00004701 de Distribuidora Ezeiza Bebidas cargado: $ 8.000. Ya suma al stock.");
  assert.equal(ficha(e, "pv1", duenio).remitos[0].vence, null);
});
