// La cuenta del turno contra el motor REAL del club (src/lib/club/motor.mjs) sobre la demo del día: que la
// cuenta cierre en cero después de «cobrar todo», que «a cargo de» sume bien (lo que paga cada uno suma
// lo que falta cobrar), y que los cierres y las opciones sean las que acepta el motor.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Reserva } from "@/lib/club/motor.mjs";
import { armarCuenta, confirmarCreditos, ejecutar, textoCierre, type VistaCuenta } from "./cuenta-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };

function demo(): EstadoClub {
  return M.generarDemo(HOY, AHORA.min);
}

/** El turno en juego con 4 jugadores, la cancha debiendo y cargos en la mesa (el caso del mostrador). */
function turnoEnJuego(e: EstadoClub): Reserva {
  const r = e.reservas.find((x) => {
    if (x.fecha !== HOY || x.estado !== "en_cancha" || x.jugadores.length !== 4 || !(M.saldo(x) > 0)) return false;
    const t = M.cuentaDelTurno(e, x.id);
    return t.ok && t.totales.cargos > 0;
  });
  assert.ok(r, "la demo trae un turno en cancha, con 4 jugadores, que debe la cancha y tiene cargos");
  return r;
}

function cuenta(e: EstadoClub, id: string): VistaCuenta {
  const v = armarCuenta(e, id);
  assert.ok(v, "el turno tiene cuenta");
  return v;
}

const sumaAPagar = (v: VistaCuenta) => v.jugadores.reduce((s, j) => s + j.aPagar, 0);
const caja = (e: EstadoClub) => M.resumenCaja(e).ingresos;

test("la cuenta del turno en juego: totales del motor, una fila por jugador y lo que paga cada uno suma lo que falta", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  const v = cuenta(e, r.id);
  const t = M.cuentaDelTurno(e, r.id);
  assert.ok(t.ok);
  assert.deepEqual(v.totales, { cancha: t.totales.cancha, cargos: t.totales.cargos, pendiente: t.totales.pendiente });
  assert.equal(v.jugadores.length, 4);
  assert.equal(sumaAPagar(v), v.totales.pendiente, "cobrarle a cada uno lo suyo cierra la cuenta");
  assert.equal(v.abierto, true);
  assert.equal(v.cierres.cobrarTodo, v.totales.pendiente);
  assert.equal(v.cierres.cerrarYSeguir, v.totales.cancha, "en cancha: se ofrece cobrar la cancha y cerrarla, la mesa sigue");
  assert.equal(v.cierres.cerrarCargos, null, "con la cancha abierta, los cargos se cobran con todo o por jugador");
  assert.equal(v.cierres.abrirCancha, false);
  assert.match(v.descripcion, /En cancha/);
  for (const j of v.jugadores) assert.match(j.detalle, /cancha/, "cada fila dice su parte de la cancha");
});

test("«Cobrar todo»: la cuenta cierra en cero, lo cobrado entra a la caja y no queda nada por cobrar", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  const antes = cuenta(e, r.id).totales.pendiente;
  const cajaAntes = caja(e);
  const d = ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, new RegExp(`Cobrado todo el turno: \\${M.pesos(antes).replace(/\./g, "\\.")}`));
  const v = cuenta(e, r.id);
  assert.equal(v.totales.pendiente, 0);
  assert.equal(v.totales.cancha, 0);
  assert.equal(v.totales.cargos, 0);
  assert.equal(sumaAPagar(v), 0);
  assert.equal(v.cierres.cobrarTodo, null, "ya no se ofrece cobrar");
  assert.ok(v.jugadores.every((j) => j.aPagar === 0 && j.situacion !== null));
  assert.equal(caja(e) - cajaAntes, antes, "caja = cobrado: entró exactamente lo que faltaba");
  // Cobrar otra vez no cobra dos veces: el motor dice que no y la pantalla lo muestra.
  const otra = ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, AHORA);
  assert.equal(otra.ok, false);
  assert.equal(otra.mensaje, "El turno no debe nada.");
  assert.equal(caja(e) - cajaAntes, antes);
});

test("«A cargo de» la cancha: el que invita paga su parte más la del otro y la suma no cambia", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  const antes = cuenta(e, r.id);
  // En la demo el jugador 1 ya pagó su parte: no se ofrece como «a cargo de» de nadie (pagó, cobrale aparte).
  assert.equal(antes.jugadores[0].cancha, null);
  assert.ok(antes.jugadores.slice(1).every((j) => !j.cancha!.opciones.some((o) => o.valor === "0")));
  const parte2 = M.partesCancha(r)[2].aPagar;
  assert.ok(antes.jugadores[2].cancha?.opciones.some((o) => o.valor === "1"), "el 3 puede pasar su parte al 2");

  const d = ejecutar(e, r.id, { tipo: "aCargoCancha", idx: 2, de: "1" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const v = cuenta(e, r.id);
  assert.equal(v.totales.pendiente, antes.totales.pendiente, "pasar la parte no cobra ni perdona nada");
  assert.equal(sumaAPagar(v), v.totales.pendiente, "lo que paga cada uno sigue sumando lo que falta");
  assert.equal(v.jugadores[1].aPagar, antes.jugadores[1].aPagar + parte2, "el 2 paga lo suyo más la parte del 3");
  assert.equal(v.jugadores[2].aPagar, antes.jugadores[2].aPagar - parte2);
  assert.equal(v.jugadores[2].aPagar, 0);
  assert.equal(v.jugadores[2].situacion, `lo paga ${r.jugadores[1].nombre}`);
  assert.match(v.jugadores[2].detalle, new RegExp(`cancha → ${r.jugadores[1].nombre}`));
  assert.equal(v.jugadores[2].cancha?.elegido, "1");
  // No se encadena: quien ya está a cargo de otro no aparece como opción para un tercero.
  assert.ok(!v.jugadores[3].cancha?.opciones.some((o) => o.valor === "2"));

  // Cobrarle al 2: cubre la parte del 3 y la caja suma exactamente su total.
  const cajaAntes = caja(e);
  const cobro = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "mercadopago" }, AHORA);
  assert.equal(cobro.ok, true, cobro.mensaje);
  assert.match(cobro.mensaje, new RegExp(`con lo de ${r.jugadores[2].nombre}`));
  assert.equal(caja(e) - cajaAntes, v.jugadores[1].aPagar);
  const despues = cuenta(e, r.id);
  assert.equal(despues.totales.pendiente, v.totales.pendiente - v.jugadores[1].aPagar);
  assert.equal(sumaAPagar(despues), despues.totales.pendiente);
  assert.equal(despues.jugadores[1].aPagar, 0);
  assert.match(despues.jugadores[2].detalle, /cancha ✔/);
});

/** Le suma un cargo del buffet a la cuenta de un jugador (el buffet es la rebanada 2: acá se carga con el motor). */
function cargar(e: EstadoClub, r: Reserva, idx: number) {
  const p = e.productos.find((x) => x.activo !== false && !x.alquiler && (x.stock === null || x.stock > 0) && x.precio > 0);
  assert.ok(p, "hay un producto para cargar");
  const res = M.consumoJugador(e, r.id, idx, p.id, 1, { modo: "cuenta" }, AHORA);
  assert.ok(res.ok, res.ok ? "" : res.motivo);
  return p.precio;
}

test("«A cargo de» los cargos: los paga otro jugador, sus cargos se le suman y al cobrar todo cierra en cero", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  const precio = cargar(e, r, 2);
  const antes = cuenta(e, r.id);
  const paga = antes.jugadores[0];
  const invitado = antes.jugadores[2];
  assert.ok(paga.cargos && invitado.cargos, "los dos tienen su cuenta de cargos y alguien a quién pasarlos");
  assert.equal(invitado.items.length, 1);
  const opcion = invitado.cargos.opciones.find((o) => o.valor === paga.cargos!.cuentaId);
  assert.ok(opcion, "se puede elegir que los pague el 1");
  assert.match(opcion.etiqueta, new RegExp(`Sus cargos los paga ${r.jugadores[0].nombre}`));

  const d = ejecutar(e, r.id, { tipo: "aCargoCargos", cuentaId: invitado.cargos.cuentaId, de: paga.cargos.cuentaId }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const v = cuenta(e, r.id);
  assert.equal(v.totales.pendiente, antes.totales.pendiente);
  assert.equal(sumaAPagar(v), v.totales.pendiente, "«a cargo de» suma bien: nada se pierde ni se duplica");
  assert.equal(v.jugadores[0].aPagar, paga.aPagar + precio, "el 1 paga sus cargos más los del 3");
  assert.equal(v.jugadores[2].aPagar, invitado.aPagar - precio, "al 3 le queda sólo su parte de la cancha");
  assert.match(v.jugadores[0].detalle, new RegExp(`\\+ cargos de ${r.jugadores[2].nombre}`));
  assert.match(v.jugadores[2].detalle, new RegExp(`→ ${r.jugadores[0].nombre}`));

  const cajaAntes = caja(e);
  const todo = ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "transferencia" }, AHORA);
  assert.equal(todo.ok, true, todo.mensaje);
  const fin = cuenta(e, r.id);
  assert.equal(fin.totales.pendiente, 0);
  assert.equal(sumaAPagar(fin), 0);
  assert.equal(caja(e) - cajaAntes, v.totales.pendiente, "caja = cobrado");
});

test("«Cobrar la cancha y cerrarla · la mesa sigue»: la cancha queda libre y los cargos siguen abiertos hasta cerrarlos", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  const antes = cuenta(e, r.id);
  assert.equal(textoCierre("cerrarYSeguir", antes.cierres.cerrarYSeguir!), `Cobrar la cancha ${M.pesos(antes.totales.cancha)} y cerrarla · la mesa sigue`);
  const d = ejecutar(e, r.id, { tipo: "cerrarYSeguir", medio: "efectivo" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /La mesa sigue/);
  const v = cuenta(e, r.id);
  assert.equal(v.estado, "finalizada");
  assert.equal(v.abierto, false);
  assert.equal(v.mesaAbierta, true);
  assert.equal(v.totales.cancha, 0);
  assert.equal(v.totales.cargos, antes.totales.cargos, "los cargos no se tocaron");
  assert.equal(v.cierres.cerrarYSeguir, null);
  assert.equal(v.cierres.cerrarCargos, antes.totales.cargos);
  assert.ok(v.jugadores.every((j) => j.cancha === null), "con la cancha cerrada no hay «a cargo de» de la cancha");

  const c = ejecutar(e, r.id, { tipo: "cerrarCargos", medio: "debito" }, AHORA);
  assert.equal(c.ok, true, c.mensaje);
  const fin = cuenta(e, r.id);
  assert.equal(fin.totales.pendiente, 0);
  assert.equal(fin.mesaAbierta, false);
  assert.equal(fin.cierres.cerrarCargos, null);
});

test("abrir la cancha de un turno reservado, y lo que el motor rechaza llega como aviso (nunca tira)", () => {
  const e = demo();
  // Con la seña pagada y la hora llegada, se abre; sin la seña, el motor no da la cancha y lo dice.
  const conSena = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.inicio <= AHORA.min && x.sena.monto > 0 && x.sena.pagada);
  assert.ok(conSena, "la demo trae un turno reservado, con la seña pagada, que ya tendría que estar jugando");
  assert.equal(cuenta(e, conSena.id).cierres.abrirCancha, true);
  ok(ejecutar(e, conSena.id, { tipo: "abrirCancha" }, AHORA));
  assert.equal(cuenta(e, conSena.id).estado, "en_cancha");
  const sinSena = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.sena.monto > 0 && !x.sena.pagada);
  assert.ok(sinSena, "la demo trae un turno con la seña sin pagar");
  const rechazo = ejecutar(e, sinSena.id, { tipo: "abrirCancha" }, AHORA);
  assert.equal(rechazo.ok, false);
  assert.match(rechazo.mensaje, /Falta la seña/);
  assert.equal(cuenta(e, sinSena.id).estado, "reservada");

  const r = turnoEnJuego(e);
  ok(ejecutar(e, r.id, { tipo: "aCargoCancha", idx: 2, de: "1" }, AHORA));
  // El 2 ya paga la parte del 3: no puede pasar a cargo de nadie (el motor no encadena).
  const encadenado = ejecutar(e, r.id, { tipo: "aCargoCancha", idx: 1, de: "3" }, AHORA);
  assert.equal(encadenado.ok, false);
  assert.match(encadenado.mensaje, /ya paga la parte de otro/);
  // Un turno que no existe no tiene cuenta.
  assert.equal(armarCuenta(e, "no-existe"), null);
});

test("la firma cambia sólo si cambia lo que se ve", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  assert.equal(cuenta(e, r.id).firma, cuenta(e, r.id).firma);
  const antes = cuenta(e, r.id).firma;
  ok(ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 3, medio: "efectivo" }, AHORA));
  assert.notEqual(cuenta(e, r.id).firma, antes);
});

function ok(d: { ok: boolean; mensaje: string }) {
  assert.equal(d.ok, true, d.mensaje);
}

test("cobrar la seña sola: cobra lo que falta de la seña, marca la seña pagada y entra a la caja", () => {
  const e = demo();
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.sena.monto > 0 && !x.sena.pagada)!;
  const v = cuenta(e, r.id);
  assert.equal(v.cierres.cobrarSena, r.sena.monto);
  const cajaAntes = caja(e);
  ok(ejecutar(e, r.id, { tipo: "cobrarSena", medio: "transferencia" }, AHORA));
  assert.equal(r.sena.pagada, true);
  assert.equal(caja(e) - cajaAntes, r.sena.monto);
  assert.equal(cuenta(e, r.id).cierres.cobrarSena, null, "ya no se ofrece");
  assert.equal(cuenta(e, r.id).totales.cancha, r.precio - r.sena.monto);
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarSena", medio: "efectivo" }, AHORA).ok, false, "no se cobra dos veces");
  ok(ejecutar(e, r.id, { tipo: "abrirCancha" }, AHORA));
});

test("créditos del cliente para cobrarle a un jugador: confirmación con lo que usa y con cuánto queda; nunca negativos", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  const idx = cuenta(e, r.id).jugadores.findIndex((j) => j.aPagar > 0 && r.jugadores[j.idx].clienteId);
  const ficha = M.cliente(e, r.jugadores[idx].clienteId!)!;
  const aPagar = cuenta(e, r.id).jugadores[idx].aPagar;
  ficha.monedero = aPagar - 10;
  const corto = confirmarCreditos(e, r.id, { tipo: "cobrarJugador", idx });
  assert.equal(corto.ok, false);
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarJugador", idx, medio: "monedero" }, AHORA).ok, false);
  assert.equal(ficha.monedero, aPagar - 10, "no se descontó nada");

  ficha.monedero = aPagar + 2000;
  const conf = confirmarCreditos(e, r.id, { tipo: "cobrarJugador", idx });
  assert.ok(conf.ok);
  assert.equal(conf.de, ficha.nombre);
  assert.equal(conf.usa, aPagar);
  assert.equal(conf.quedan, 2000);
  const cajaAntes = caja(e);
  ok(ejecutar(e, r.id, { tipo: "cobrarJugador", idx, medio: "monedero" }, AHORA));
  assert.equal(ficha.monedero, 2000, "queda lo que dijo la confirmación");
  assert.equal(caja(e), cajaAntes, "los créditos no entran a la caja");
  assert.equal(cuenta(e, r.id).jugadores[idx].aPagar, 0);
  // Con créditos no se cobra todo junto (el motor lo pide jugador por jugador).
  assert.equal(confirmarCreditos(e, "no-existe", { tipo: "cobrarSena" }).ok, false);
});

test("la seña con créditos avisa que queda pagada", () => {
  const e = demo();
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.sena.monto > 0 && !x.sena.pagada && x.clienteId);
  if (!r) return;
  M.cliente(e, r.clienteId!)!.monedero = r.sena.monto;
  const conf = confirmarCreditos(e, r.id, { tipo: "cobrarSena" });
  assert.ok(conf.ok);
  assert.equal(conf.cubreSena, true);
  assert.equal(conf.quedan, 0);
});

test("cargar un producto a un jugador: a su cuenta, o cobrado en el acto (y la cuenta del turno lo suma)", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  const p = e.productos.find((x) => x.activo !== false && !x.alquiler && (x.stock === null || x.stock > 1) && x.precio > 0)!;
  const antes = cuenta(e, r.id);
  ok(ejecutar(e, r.id, { tipo: "cargo", idx: 2, productoId: p.id, cant: 2, modo: "cuenta", medio: "efectivo" }, AHORA));
  const v = cuenta(e, r.id);
  assert.equal(v.totales.cargos, antes.totales.cargos + 2 * p.precio);
  assert.equal(sumaAPagar(v), v.totales.pendiente);
  const cajaAntes = caja(e);
  ok(ejecutar(e, r.id, { tipo: "cargo", idx: 3, productoId: p.id, cant: 1, modo: "cobrar", medio: "efectivo" }, AHORA));
  assert.equal(caja(e) - cajaAntes, p.precio, "cobrado en el acto entra a la caja");
  assert.equal(cuenta(e, r.id).totales.cargos, v.totales.cargos, "y no queda debiendo");
});
