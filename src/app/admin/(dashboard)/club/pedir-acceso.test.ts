// «¿Sos nuevo/a? Pedí acceso» desde la pantalla bloqueada (almacen.pedirAcceso, el `pedirAcceso` del club de hoy):
// lo único que se escribe sin PIN en la jornada real. Deja un pedido pendiente que el dueño resuelve en el Tablero
// (tablero-core: «otorgar» / «rechazarAcceso»); no da acceso a nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { candadoDeLaJornada, claveDeLaJornada, crearAlmacen, LARGO_NOMBRE_ACCESO, MINUTO_DEMO, operadorDeLaDemo, TOPE_PEDIDOS_DE_ACCESO, textoDeLaDemo, textoDelEstado, type AlmacenamientoLocal } from "./almacen";
import { armarTablero, ejecutarTablero } from "./tablero-core";

const HOY = "2026-10-17";
const NEGOCIO = "demo-club";
const vaciar = () => new Promise<void>((r) => setImmediate(r));

function memoria(): AlmacenamientoLocal {
  const datos = new Map<string, string>();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)), removeItem: (k) => void datos.delete(k) };
}

/** La jornada real de este equipo (la demo del día guardada), abierta y SIN nadie operando: la pantalla bloqueada. */
async function bloqueada() {
  const m = memoria();
  m.setItem(claveDeLaJornada(NEGOCIO), textoDeLaDemo(textoDelEstado(M.generarDemo(HOY, MINUTO_DEMO)), HOY, 1));
  const s = crearAlmacen({
    reloj: "real",
    clave: claveDeLaJornada(NEGOCIO),
    candado: candadoDeLaJornada(NEGOCIO),
    almacenamiento: m,
    cerrojos: null,
    relojMs: () => new Date(2026, 9, 17, 20, 0, 5).getTime(),
    demoraGuardadoMs: 0,
    enReposo: null,
    canal: null,
  });
  s.arrancar();
  await vaciar();
  return s;
}
const pendientes = (e: M.EstadoClub) => e.solicitudesAcceso.filter((x) => x.estado === "pendiente").map((x) => x.nombre);

test("sin PIN no se opera, pero se puede pedir acceso: queda pendiente para el dueño, con aviso y sin «Deshacer»", async () => {
  const s = await bloqueada();
  assert.equal(s.operador(), null);
  assert.equal(s.ejecutar(() => ({ ok: true, mensaje: "x" })).ok, false, "el resto sigue pidiendo el PIN");
  const antes = pendientes(s.estado()).length;
  const v = s.version();
  const d = s.pedirAcceso("  Nico (finde)  ");
  assert.deepEqual(d, { ok: true, mensaje: "Listo: el pedido le llegó al dueño. Cuando lo apruebe te da el PIN." });
  assert.equal(pendientes(s.estado()).length, antes + 1);
  assert.ok(pendientes(s.estado()).includes("Nico (finde)"), "el nombre, sin espacios de más");
  assert.ok(s.version() > v, "avisa a las pantallas (y se guarda)");
  assert.equal(s.aviso()?.deshacer, false);
  assert.equal(s.puedeDeshacer(), false);
  assert.equal(s.operador(), null, "pedir no deja entrar a nadie");
  // Le llega al dueño en el Tablero, que lo otorga con el rol.
  const pedido = armarTablero(s.estado(), s.ahora()).accesos.find((x) => x.nombre === "Nico (finde)");
  assert.ok(pedido, "está en «Novedades para autorizar»");
  // Con el PIN guardado con hash, el dueño de la demo firma con su PIN en claro (operadorDeLaDemo), no con u.pin.
  const duenio = operadorDeLaDemo(s.estado(), "OWNER")!.auth;
  const r = ejecutarTablero(s.estado(), { tipo: "otorgar", solicitudId: pedido.id, rol: "recepcion" }, s.ahora(), duenio);
  assert.equal(r.ok, true, r.mensaje);
});

test("el mismo nombre dos veces, vacío o con caracteres de control: lo dice el motor y no se duplica", async () => {
  const s = await bloqueada();
  assert.equal(s.pedirAcceso("Nico").ok, true);
  const n = pendientes(s.estado()).length;
  assert.deepEqual(s.pedirAcceso("nico"), { ok: false, mensaje: "Ya hay un pedido de acceso con ese nombre esperando al dueño." });
  assert.deepEqual(s.pedirAcceso("   "), { ok: false, mensaje: "Escribí tu nombre." });
  assert.equal(pendientes(s.estado()).length, n);
  assert.equal(s.pedirAcceso("Ana\u0000\nPérez").ok, true);
  assert.ok(pendientes(s.estado()).includes("Ana  Pérez"), "sin saltos ni caracteres de control");
  assert.equal(s.pedirAcceso("x".repeat(200)).ok, true);
  assert.ok(pendientes(s.estado()).includes("x".repeat(LARGO_NOMBRE_ACCESO)), "recortado");
});

test("con muchos pedidos esperando no se suman más (sin PIN no se llena el estado de pedidos)", async () => {
  const s = await bloqueada();
  for (let i = pendientes(s.estado()).length; i < TOPE_PEDIDOS_DE_ACCESO; i++) assert.equal(s.pedirAcceso(`Persona ${i}`).ok, true);
  const d = s.pedirAcceso("Una más");
  assert.equal(d.ok, false);
  assert.match(d.mensaje, /varios pedidos de acceso esperando/);
  assert.equal(pendientes(s.estado()).length, TOPE_PEDIDOS_DE_ACCESO);
});
