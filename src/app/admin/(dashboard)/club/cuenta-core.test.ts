// La cuenta del turno contra el motor REAL del club (src/lib/club/motor.mjs) sobre la demo del día: que la
// cuenta cierre en cero después de «cobrar todo», que «a cargo de» sume bien (lo que paga cada uno suma
// lo que falta cobrar), y que los cierres y las opciones sean las que acepta el motor.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Fijo } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub, Reserva } from "@/lib/club/motor.mjs";
import { readFileSync } from "node:fs";
import { operadorDeLaDemo } from "./almacen";
import { ejecutarBajaFijo, otroFijoQuePisa } from "./canchas-core";
import { aprobarConCodigo, codigoDeLaDemo, pedidosPendientes, pedirFiado } from "./credito-core";
import { armarCuenta, canchaOcupada, confirmarCreditos, DESHACIBLE, EN_EL_VANILLA, ejecutar, fichasParaSumar, partirConCreditos, revisarConfirmacion, sugerirFichas, textoCierre, type VistaCuenta } from "./cuenta-core";

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

test("la confirmación de créditos se revisa al tocar «Sí»: si el monto cambió (extender, deshacer) se vuelve a pedir", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  // Uno que todavía debe su parte de la cancha: extender le sube lo que paga.
  const idx = cuenta(e, r.id).jugadores.findIndex((j) => M.partesCancha(r)[j.idx].aPagar > 0 && r.jugadores[j.idx].clienteId);
  M.cliente(e, r.jugadores[idx].clienteId!)!.monedero = 200000;
  const mostrada = confirmarCreditos(e, r.id, { tipo: "cobrarJugador", idx });
  assert.ok(mostrada.ok);
  assert.deepEqual(revisarConfirmacion(mostrada, confirmarCreditos(e, r.id, { tipo: "cobrarJugador", idx })), { tipo: "seguir" });
  // Mientras estaba abierta, se extendió el turno: la parte del jugador sube.
  const libre = M.validarHueco(e, { canchaId: r.canchaId, fecha: HOY, inicio: r.inicio + r.duracion, duracion: 30 }).ok;
  assert.ok(libre, "en la demo, después de este turno hay lugar para extender");
  assert.ok(M.extender(e, r.id, 30, AHORA).ok);
  const rev = revisarConfirmacion(mostrada, confirmarCreditos(e, r.id, { tipo: "cobrarJugador", idx }));
  assert.equal(rev.tipo, "otra", "no se cobra el monto viejo");
  if (rev.tipo === "otra") assert.notDeepEqual([rev.datos.usa, rev.datos.quedan], [mostrada.usa, mostrada.quedan]);
  // Si ya no alcanzan, no se cobra y se dice por qué.
  M.cliente(e, r.jugadores[idx].clienteId!)!.monedero = 1;
  const no = revisarConfirmacion(mostrada, confirmarCreditos(e, r.id, { tipo: "cobrarJugador", idx }));
  assert.equal(no.tipo, "no");
});

// ───────────── ola 1 de paridad: jugadores, nota, cobro parcial, sólo la cancha, cancha a cuenta corriente ─────────────

const reservado = (e: EstadoClub, titular: string) => {
  const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && x.titular === titular);
  assert.ok(r, `la demo trae el turno reservado de ${titular}`);
  return r;
};
const cobradoTodo = (e: EstadoClub) => e.reservas.reduce((s, r) => s + M.cobrado(r), 0) + e.cuentas.reduce((s, c) => s + M.cobradoCuenta(c), 0);
const monederos = (e: EstadoClub) => e.clientes.reduce((s, c) => s + c.monedero, 0);

test("«Deshacer» sigue la regla del club vanilla: cada acción se deshace sí y sólo si está en su DESHACIBLES", () => {
  const app = readFileSync(new URL("../../../../../public/previews/breakpoint/club/app.mjs", import.meta.url), "utf8");
  const lista = /const DESHACIBLES = new Set\((\[[^\]]*\])\)/.exec(app);
  assert.ok(lista, "el vanilla define DESHACIBLES");
  const vanilla = new Set(JSON.parse(lista[1]) as string[]);
  for (const [tipo, deshace] of Object.entries(DESHACIBLE)) {
    const nombre = EN_EL_VANILLA[tipo as keyof typeof EN_EL_VANILLA];
    assert.equal(deshace, vanilla.has(nombre), `${tipo} (en el vanilla «${nombre}»)`);
  }
});

test("sumar un jugador: por nombre o con su ficha (el nombre sale de la ficha), hasta 4, sin repetir ficha y sólo con la cancha abierta", () => {
  const e = demo();
  const r = reservado(e, "Lucas Fernández");
  assert.equal(cuenta(e, r.id).sumarJugador, true);
  const d = ejecutar(e, r.id, { tipo: "sumarJugador", nombre: "  Pedro  ", clienteId: null }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Pedro sumado al turno.");
  // Las fichas que coinciden: desde 2 letras, hasta 5, y no las que ya juegan.
  assert.deepEqual(fichasParaSumar(e, r.id, "a"), []);
  const otra = e.clientes.find((c) => c.activo !== false && c.id !== r.clienteId)!;
  const propuestas = fichasParaSumar(e, r.id, otra.nombre.slice(0, 4));
  assert.ok(propuestas.some((f) => f.id === otra.id) && propuestas.length <= 5);
  assert.ok(!fichasParaSumar(e, r.id, "Lucas").some((f) => f.id === r.clienteId), "el titular ya juega: no se ofrece");
  const conFicha = ejecutar(e, r.id, { tipo: "sumarJugador", nombre: "lo que sea", clienteId: otra.id }, AHORA);
  assert.equal(conFicha.ok, true, conFicha.mensaje);
  assert.equal(r.jugadores.at(-1)?.nombre, otra.nombre);
  assert.equal(r.jugadores.at(-1)?.clienteId, otra.id);
  assert.equal(ejecutar(e, r.id, { tipo: "sumarJugador", nombre: "", clienteId: otra.id }, AHORA).mensaje, "Esa ficha ya juega en este turno.");
  assert.equal(ejecutar(e, r.id, { tipo: "sumarJugador", nombre: "   ", clienteId: null }, AHORA).ok, false, "sin nombre no se suma");
  assert.equal(ejecutar(e, r.id, { tipo: "sumarJugador", nombre: "Juan", clienteId: null }, AHORA).ok, true);
  assert.equal(r.jugadores.length, 4);
  assert.equal(cuenta(e, r.id).sumarJugador, false, "con 4 ya no se ofrece");
  assert.equal(ejecutar(e, r.id, { tipo: "sumarJugador", nombre: "Quinto", clienteId: null }, AHORA).mensaje, "Ya están los cuatro.");
  // Lo que se cobra no cambia por sumar jugadores: se reparte distinto, nada más.
  assert.equal(cuenta(e, r.id).jugadores.reduce((s, j) => s + j.aPagar, 0), cuenta(e, r.id).totales.pendiente);
  const cerrada = e.reservas.find((x) => x.fecha === HOY && x.estado === "finalizada")!;
  assert.match(ejecutar(e, cerrada.id, { tipo: "sumarJugador", nombre: "Tarde", clienteId: null }, AHORA).mensaje, /ya está cerrada/);
});

test("la nota del turno se ve en la cuenta", () => {
  const e = demo();
  const r = reservado(e, "Lucas Fernández");
  assert.equal(cuenta(e, r.id).notas, null);
  r.notas = "  Traen paleta propia  ";
  assert.equal(cuenta(e, r.id).notas, "Traen paleta propia");
});

test("cobrar una parte de la cancha: entra a la caja lo cobrado, sugiere lo que falta de la seña y no deja cobrar de más", () => {
  const e = demo();
  const r = reservado(e, "Grupo de Bruno (nuevo)");
  const v = cuenta(e, r.id);
  assert.deepEqual([v.cancha?.saldo, v.cancha?.sugerido], [42000, 21000], "con seña pendiente se sugiere la seña");
  const caja0 = caja(e);
  const d = ejecutar(e, r.id, { tipo: "cobrarCancha", monto: 21000, medio: "transferencia" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /Seña pagada/);
  assert.equal(r.sena.pagada, true);
  assert.equal(caja(e) - caja0, 21000);
  assert.equal(cuenta(e, r.id).cancha?.sugerido, 21000, "sin seña pendiente se sugiere todo lo que falta");
  const deMas = ejecutar(e, r.id, { tipo: "cobrarCancha", monto: 21001, medio: "efectivo" }, AHORA);
  assert.equal(deMas.ok, false);
  assert.match(deMas.mensaje, /cobrando de más/);
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarCancha", monto: 0, medio: "efectivo" }, AHORA).ok, false);
  assert.equal(caja(e) - caja0, 21000, "lo rechazado no toca la caja");
  // Sin ficha no hay a dónde pasar la cancha a cuenta corriente.
  assert.equal(cuenta(e, r.id).cancha?.aCuenta.ok, false);
});

test("propiedad: cobros parciales al azar → la cancha se cobra exacta, la caja es lo cobrado y la cuenta cierra en cero", () => {
  let semilla = 7;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const medios = ["efectivo", "mercadopago", "transferencia", "debito"] as const;
  for (let t = 0; t < 60; t++) {
    const e = demo();
    const r = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && M.saldo(x) > 0 && !(x.sena.monto > 0 && !x.sena.pagada))!;
    const precio = M.totalReserva(r);
    const caja0 = caja(e);
    const cobrado0 = M.cobrado(r);
    for (let k = 0; k < 8 && M.saldo(r) > 0; k++) {
      const monto = Math.floor(azar() * (M.saldo(r) * 1.3)) - 100;
      const d = ejecutar(e, r.id, { tipo: "cobrarCancha", monto, medio: medios[Math.floor(azar() * 4)] }, AHORA);
      assert.equal(d.ok, monto > 0 && monto <= M.saldo(r) + (d.ok ? monto : 0), `caso ${t}: ${d.mensaje}`);
      assert.ok(M.saldo(r) >= 0, `caso ${t}: la cancha nunca queda en negativo`);
    }
    const resto = M.saldo(r);
    if (resto > 0) assert.equal(ejecutar(e, r.id, { tipo: "cobrarCancha", monto: resto, medio: "efectivo" }, AHORA).ok, true);
    assert.equal(M.saldo(r), 0);
    assert.equal(M.cobrado(r), precio, `caso ${t}: la cancha se cobró exacta`);
    assert.equal(caja(e) - caja0, precio - cobrado0, `caso ${t}: la caja sube lo cobrado`);
    assert.equal(cuenta(e, r.id).totales.pendiente, 0, `caso ${t}: la cuenta cierra en cero`);
    assert.equal(cuenta(e, r.id).cancha, null, "ya no se ofrece cobrar la cancha");
  }
});

test("«Sólo la cancha»: cobra la parte de la cancha de un jugador (con la de los que invita) y sus cargos siguen", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  // Uno que debe su parte de la cancha y no tiene cargos: «Sólo la cancha» no aparece (sería el mismo botón).
  const sinCargos = cuenta(e, r.id).jugadores.find((j) => j.aPagar > 0 && j.aPagar === M.partesCancha(r)[j.idx].aPagar)!;
  assert.ok(sinCargos, "la demo trae un jugador que debe sólo la cancha");
  assert.equal(sinCargos.soloCancha, null);
  const prod = e.productos.find((p) => p.precio > 0 && p.activo !== false && !p.alquiler && (p.stock == null || p.stock > 2))!;
  assert.equal(ejecutar(e, r.id, { tipo: "cargo", idx: sinCargos.idx, productoId: prod.id, cant: 2, modo: "cuenta", medio: "efectivo" }, AHORA).ok, true);
  const v = cuenta(e, r.id);
  const fila = v.jugadores[sinCargos.idx];
  assert.equal(fila.soloCancha, M.partesCancha(r)[fila.idx].aPagar, "con cargos, se ofrece cobrar sólo su cancha");
  assert.ok(fila.aPagar > fila.soloCancha!);
  const caja0 = caja(e);
  const cargos0 = v.totales.cargos;
  const d = ejecutar(e, r.id, { tipo: "cobrarParte", idx: fila.idx, medio: "debito" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(caja(e) - caja0, fila.soloCancha, "entra exactamente su parte de la cancha");
  const despues = cuenta(e, r.id);
  assert.equal(despues.totales.cargos, cargos0, "sus cargos no se tocaron");
  assert.equal(despues.totales.pendiente, v.totales.pendiente - fila.soloCancha!);
  assert.equal(despues.jugadores[fila.idx].soloCancha, null);
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarParte", idx: fila.idx, medio: "debito" }, AHORA).ok, false, "no se cobra dos veces");
  // Cobrar todo lo que queda: cierra en cero y la caja es lo cobrado.
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, AHORA).ok, true);
  assert.equal(cuenta(e, r.id).totales.pendiente, 0);
  assert.equal(caja(e) - caja0, v.totales.pendiente);
});

test("cerrar la cancha a cuenta corriente: la deuda sube lo que faltaba, la caja no, la mesa sigue; sin cuenta corriente, no", () => {
  const e = demo();
  const r = reservado(e, "Lucas Fernández");
  const ficha = M.cliente(e, r.clienteId!)!;
  const v = cuenta(e, r.id);
  assert.deepEqual(v.cancha?.aCuenta, { ok: true });
  const [deuda0, caja0, saldo0] = [ficha.deuda, caja(e), M.saldo(r)];
  const d = ejecutar(e, r.id, { tipo: "canchaACuenta" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, new RegExp(`${M.pesos(saldo0).replace(/\./g, "\\.").replace("$", "\\$")} a la cuenta corriente de Lucas Fernández`));
  assert.equal(ficha.deuda - deuda0, saldo0);
  assert.equal(caja(e), caja0, "lo que va a cuenta corriente no entra a la caja");
  assert.equal(r.estado, "finalizada");
  assert.equal(cuenta(e, r.id).totales.cancha, 0, "la cancha queda en cero");
  assert.equal(ejecutar(e, r.id, { tipo: "canchaACuenta" }, AHORA).ok, false, "no se pasa dos veces");

  const sinCC = reservado(e, "Valentina Paz");
  const vs = cuenta(e, sinCC.id);
  assert.equal(vs.cancha?.aCuenta.ok, false);
  const no = ejecutar(e, sinCC.id, { tipo: "canchaACuenta" }, AHORA);
  assert.equal(no.ok, false);
  assert.match(no.mensaje, /no tiene cuenta corriente/);
  assert.equal(sinCC.estado, "reservada", "lo rechazado no cierra nada");
});

test("créditos para cobrar un monto de la cancha o la parte de un jugador: el paso previo y nunca negativos ni a la caja", () => {
  const e = demo();
  const r = reservado(e, "Lucas Fernández");
  const ficha = M.cliente(e, r.clienteId!)!;
  ficha.monedero = 10000;
  assert.equal(confirmarCreditos(e, r.id, { tipo: "cobrarCancha", monto: 12000 }).ok, false, "no alcanzan");
  assert.match((confirmarCreditos(e, r.id, { tipo: "cobrarCancha", monto: 99999 }) as { motivo: string }).motivo, /cobrando de más/);
  const conf = confirmarCreditos(e, r.id, { tipo: "cobrarCancha", monto: 8000 });
  assert.ok(conf.ok);
  assert.deepEqual([conf.usa, conf.quedan, conf.que], [8000, 2000, "Cancha"]);
  const [caja0, cobrado0, monederos0] = [caja(e), cobradoTodo(e), monederos(e)];
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarCancha", monto: 8000, medio: "monedero" }, AHORA).ok, true);
  assert.equal(caja(e), caja0, "con créditos no entra plata a la caja");
  assert.equal(cobradoTodo(e) - cobrado0, monederos0 - monederos(e), "lo cobrado es lo que bajaron los créditos");
  assert.equal(ficha.monedero, conf.quedan);

  const t = turnoEnJuego(e);
  const idx = cuenta(e, t.id).jugadores.find((j) => M.partesCancha(t)[j.idx].aPagar > 0 && t.jugadores[j.idx].clienteId)?.idx;
  assert.ok(idx !== undefined, "hay un jugador con ficha que debe su parte de la cancha");
  {
    const parte = M.partesCancha(t)[idx].aPagar;
    M.cliente(e, t.jugadores[idx].clienteId!)!.monedero = parte;
    const c = confirmarCreditos(e, t.id, { tipo: "cobrarParte", idx });
    assert.ok(c.ok);
    assert.deepEqual([c.usa, c.quedan], [parte, 0]);
    assert.equal(ejecutar(e, t.id, { tipo: "cobrarParte", idx, medio: "monedero" }, AHORA).ok, true);
    assert.equal(M.cliente(e, t.jugadores[idx].clienteId!)!.monedero, 0, "quedan en cero, nunca negativos");
  }
});

// ───────────── UAT del torneo: la mesa sigue cargando y se fía desde la cuenta del turno ─────────────

test("«La mesa sigue»: con la cancha cerrada se suman cargos en la cuenta del turno; entran a la cuenta y al cobro (caja = cobrado)", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  assert.equal(cuenta(e, r.id).sumarCargo, true);
  assert.equal(ejecutar(e, r.id, { tipo: "cerrarYSeguir", medio: "efectivo" }, AHORA).ok, true);
  const v = cuenta(e, r.id);
  assert.equal(v.abierto, false);
  assert.equal(v.mesaAbierta, true);
  assert.equal(v.sumarCargo, true, "con la mesa siguiendo se ofrece sumar cargos");
  const prod = e.productos.find((p) => p.precio > 0 && p.activo !== false && !p.alquiler && (p.stock == null || p.stock > 4))!;
  const cargos0 = v.totales.cargos;
  const d = ejecutar(e, r.id, { tipo: "cargo", idx: 2, productoId: prod.id, cant: 4, modo: "cuenta", medio: "efectivo" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const despues = cuenta(e, r.id);
  assert.equal(despues.totales.cargos, cargos0 + 4 * prod.precio, "el cargo entra a la cuenta del turno");
  assert.equal(despues.cierres.cerrarCargos, despues.totales.cargos, "y al cobro de los cargos");
  const caja0 = caja(e);
  assert.equal(ejecutar(e, r.id, { tipo: "cerrarCargos", medio: "mercadopago" }, AHORA).ok, true);
  assert.equal(caja(e) - caja0, cargos0 + 4 * prod.precio, "caja = cobrado");
  assert.equal(cuenta(e, r.id).totales.pendiente, 0, "la cuenta cierra en cero");
  assert.equal(cuenta(e, r.id).sumarCargo, false, "con la mesa cerrada ya no se suman cargos");
  // Un turno ya cerrado y sin mesa no ofrece cargar.
  const viejo = e.reservas.find((x) => x.fecha === HOY && x.estado === "finalizada" && !M.mesasAbiertas(e).some((m) => m.reserva.id === x.id))!;
  assert.equal(cuenta(e, viejo.id).sumarCargo, false);
});

test("fiar desde la cuenta del turno: pedido → código del dueño (5 intentos) → aprobado → a su cuenta corriente: suma a la deuda, no a la caja", () => {
  const e = demo();
  const auth = operadorDeLaDemo(e, "RECEPTION")!.auth;
  const r = reservado(e, "Valentina Paz");
  const ficha = M.cliente(e, r.clienteId!)!;
  assert.equal(ficha.cc.habilitada, false, "Valentina no tiene cuenta corriente");
  const prod = e.productos.find((p) => p.precio > 0 && p.activo !== false && !p.alquiler && (p.stock == null || p.stock > 2))!;
  assert.equal(ejecutar(e, r.id, { tipo: "cargo", idx: 0, productoId: prod.id, cant: 2, modo: "cuenta", medio: "efectivo" }, AHORA).ok, true);
  const c0 = cuenta(e, r.id).jugadores[0].credito!;
  assert.deepEqual([c0.monto, c0.aCuenta, c0.pedirFiado, c0.pedidoId], [2 * prod.precio, false, true, null]);
  assert.match(c0.motivo ?? "", /no tiene cuenta corriente/);
  // Sin el OK, pasar a cuenta corriente no anda.
  assert.equal(ejecutar(e, r.id, { tipo: "cargosACuentaDe", cuentaId: c0.cuentaId }, AHORA).ok, false);
  // El pedido.
  assert.equal(pedirFiado(e, c0.cuentaId, auth, AHORA).ok, true);
  const c1 = cuenta(e, r.id).jugadores[0].credito!;
  assert.ok(c1.pedidoId);
  assert.equal(c1.pedirFiado, false, "con un pedido esperando no se pide otro");
  // Un código inventado: uno menos de los 5 intentos.
  assert.equal(aprobarConCodigo(e, c1.pedidoId!, "AAA-AAA", auth, AHORA).ok, false);
  assert.equal(pedidosPendientes(e, AHORA).find((p) => p.id === c1.pedidoId)?.quedan, 4);
  // El del dueño aprueba.
  const codigo = codigoDeLaDemo(e, c1.pedidoId!)!.codigo;
  assert.equal(aprobarConCodigo(e, c1.pedidoId!, codigo.toLowerCase(), auth, AHORA).ok, true);
  const c2 = cuenta(e, r.id).jugadores[0].credito!;
  assert.equal(c2.aCuenta, true, "con el fiado aprobado, sus cargos pasan a su cuenta corriente");
  const [deuda0, caja0] = [ficha.deuda, caja(e)];
  const d = ejecutar(e, r.id, { tipo: "cargosACuentaDe", cuentaId: c2.cuentaId }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(ficha.deuda - deuda0, c2.monto, "lo fiado suma a la deuda");
  assert.equal(caja(e), caja0, "y no a la caja");
  assert.equal(cuenta(e, r.id).jugadores[0].credito, null, "sus cargos quedaron cerrados");
  assert.equal(ejecutar(e, r.id, { tipo: "cargosACuentaDe", cuentaId: c2.cuentaId }, AHORA).ok, false, "no se pasa dos veces");
});

test("a crédito va lo que paga cada uno: los cargos a cargo de otro no se fían por separado y el que paga lleva los dos", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  const prod = e.productos.find((p) => p.precio > 0 && p.activo !== false && !p.alquiler && (p.stock == null || p.stock > 4))!;
  for (const idx of [0, 1, 2, 3]) ejecutar(e, r.id, { tipo: "cargo", idx, productoId: prod.id, cant: 1, modo: "cuenta", medio: "efectivo" }, AHORA);
  const v = cuenta(e, r.id);
  const conCargos = v.jugadores.filter((j) => j.credito);
  assert.ok(conCargos.length >= 2, "dos jugadores que pagan sus propios cargos");
  const [paga, invitado] = conCargos;
  const total = paga.credito!.monto + invitado.credito!.monto;
  assert.equal(ejecutar(e, r.id, { tipo: "aCargoCargos", cuentaId: invitado.credito!.cuentaId, de: paga.credito!.cuentaId }, AHORA).ok, true);
  const despues = cuenta(e, r.id);
  assert.equal(despues.jugadores[invitado.idx].credito, null);
  assert.equal(despues.jugadores[paga.idx].credito?.monto, total);
});

test("«Cobrar todo» y «Cerrar la cancha»: 3 toques como el club de hoy, sin dejar una mesa en cero en Buffet", () => {
  const e = demo();
  const r = turnoEnJuego(e);
  assert.equal(cuenta(e, r.id).cierres.cerrarCancha, false, "debe plata: primero se cobra");
  assert.ok(ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, AHORA).ok);
  const v = cuenta(e, r.id);
  assert.equal(v.cierres.cerrarCancha, true);
  const res = ejecutar(e, r.id, { tipo: "cerrarCancha" }, AHORA);
  assert.ok(res.ok, res.mensaje);
  assert.equal(M.mesasAbiertas(e).some((m) => m.reserva.id === r.id), false, "cerrar la cancha no deja la mesa abierta");
  assert.equal(DESHACIBLE.cerrarCancha, true);
  assert.equal(EN_EL_VANILLA.cerrarCancha, "finalizar");
});

test("«Hacer fijo» desde el turno: un toque, el mismo día, hora y cancha; no se duplica el de hoy", () => {
  const e = demo();
  const r = e.reservas.find((x) => x.fecha === HOY && x.tipo === "turno" && x.estado === "reservada" && !x.fijoId)!;
  assert.ok(r, "la demo trae un turno común reservado hoy");
  const v = cuenta(e, r.id);
  assert.ok(v.cierres.hacerFijo, "se ofrece");
  const fijosAntes = e.fijos.length;
  const res = ejecutar(e, r.id, { tipo: "hacerFijo" }, AHORA);
  assert.ok(res.ok, res.mensaje);
  assert.equal(e.fijos.length, fijosAntes + 1);
  const f = e.fijos.at(-1)!;
  assert.equal(r.fijoId, f.id);
  assert.equal(e.reservas.filter((x) => x.fijoId === f.id && x.fecha === HOY).length, 1, "hoy queda uno solo");
  assert.equal(cuenta(e, r.id).cierres.hacerFijo, null, "ya es fijo: no se ofrece de nuevo");
  assert.equal(DESHACIBLE.hacerFijo, false);
});

test("«Hacer fijo» de un turno a más de una semana se rechaza: no aparece un fijo antes de la fecha elegida (Gate)", () => {
  const e = demo();
  const lejos = M.sumarDias(HOY, 10);
  const res = M.crearReserva(e, { canchaId: "c1", fecha: lejos, inicio: 10 * 60, titular: "Lejano" }, AHORA);
  assert.ok(res.ok, res.ok ? "" : res.motivo);
  const fijosAntes = e.fijos.length;
  const r = ejecutar(e, res.reserva.id, { tipo: "hacerFijo" }, AHORA);
  assert.equal(r.ok, false);
  assert.equal(e.fijos.length, fijosAntes);
});

// ─────────────── Cobro entre 4 (reingeniería de Break Point, Tanda 1 · 1C — BP-030…BP-034) ───────────────

/** Un turno de $ 42.000 con un solo jugador (Pedro), sin seña, en un hueco libre de mañana; abierto si `abrir`. */
function turnoDe42(e: EstadoClub, { precio = 42000, abrir = false } = {}): Reserva {
  const fecha = M.sumarDias(HOY, 1);
  for (const c of e.canchas) {
    for (const inicio of [9 * 60, 10 * 60 + 30, 12 * 60, 14 * 60, 15 * 60 + 30]) {
      const res = M.crearReserva(e, { canchaId: c.id, fecha, inicio, duracion: 90, tipo: "turno", titular: "Pedro", precio, conSena: false }, AHORA);
      if (res.ok) {
        if (abrir) res.reserva.estado = "en_cancha";
        return res.reserva;
      }
    }
  }
  assert.fail("la demo tiene algún hueco libre mañana");
}

const porMedio = (e: EstadoClub, medio: string) => M.resumenCaja(e).porMedio[medio] ?? 0;

/** Una ficha con créditos («Beto»): la primera activa, con su monedero en `creditos`. */
function fichaConCreditos(e: EstadoClub, creditos: number) {
  const c = e.clientes.find((x) => x.activo !== false && !(x.deuda > 0));
  assert.ok(c, "la demo tiene fichas");
  c.monedero = creditos;
  return c;
}

test("BP-030 · «Dividir entre 4»: 4 filas sin cargar nombres («Jugador 2…4») que suman exacto lo que debe la cancha", () => {
  const e = demo();
  const r = turnoDe42(e);
  const antes = cuenta(e, r.id);
  assert.equal(antes.dividir, 4, "con un solo jugador se ofrece dividir entre 4");
  assert.equal(antes.jugadores.length, 1);
  const d = ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Dividido entre 4: $ 10.500 cada uno.");
  const v = cuenta(e, r.id);
  assert.deepEqual(v.jugadores.map((j) => j.nombre), ["Pedro", "Jugador 2", "Jugador 3", "Jugador 4"]);
  assert.deepEqual(v.jugadores.map((j) => j.aPagar), [10500, 10500, 10500, 10500]);
  assert.equal(sumaAPagar(v), 42000);
  assert.equal(sumaAPagar(v), v.totales.pendiente, "las 4 filas suman exacto lo que falta");
  assert.ok(v.jugadores.every((j) => j.pagoCon === null), "ninguna fila arranca con medio");
  assert.equal(v.dividir, null, "ya son 4: no se ofrece de nuevo");
  assert.equal(v.sumarJugador, false);
  const otra = ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA);
  assert.equal(otra.ok, false);
  assert.equal(e.reservas.find((x) => x.id === r.id)!.jugadores.length, 4, "no suma de más");
  assert.equal(DESHACIBLE.dividir, true, "se deshace como «sumar jugador» del vanilla");
});

test("BP-030 · dividir un precio que no da redondo: suman exacto igual; con 2 jugadores suma «Jugador 3» y «Jugador 4»", () => {
  const e = demo();
  const r = turnoDe42(e, { precio: 42010 });
  assert.equal(ejecutar(e, r.id, { tipo: "sumarJugador", nombre: "Ana", clienteId: null }, AHORA).ok, true);
  const d = ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const v = cuenta(e, r.id);
  assert.deepEqual(v.jugadores.map((j) => j.nombre), ["Pedro", "Ana", "Jugador 3", "Jugador 4"]);
  assert.equal(sumaAPagar(v), 42010, "a pesos exactos, sin perder ni sumar un peso");
  assert.ok(v.jugadores.every((j) => j.aPagar >= 10500 && j.aPagar <= 10510));
  // Con la cancha cerrada no se divide.
  const cerrado = demo();
  const c = turnoDe42(cerrado);
  c.estado = "finalizada";
  assert.equal(ejecutar(cerrado, c.id, { tipo: "dividir", n: 4 }, AHORA).ok, false);
});

test("BP-031 · cada fila con su medio: la 1 con MP y la 2 en efectivo → la caja los separa y la 3 queda sin medio", () => {
  const e = demo();
  const r = turnoDe42(e, { abrir: true });
  assert.equal(ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA).ok, true);
  const mp = porMedio(e, "mercadopago");
  const ef = porMedio(e, "efectivo");
  const d1 = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 0, medio: "mercadopago" }, AHORA);
  assert.equal(d1.ok, true, d1.mensaje);
  const d2 = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "efectivo" }, AHORA);
  assert.equal(d2.ok, true, d2.mensaje);
  assert.equal(d2.mensaje, "Cobrado $ 10.500 a Jugador 2.");
  assert.equal(porMedio(e, "mercadopago") - mp, 10500, "MP: $ 10.500");
  assert.equal(porMedio(e, "efectivo") - ef, 10500, "efectivo: $ 10.500, aparte");
  const v = cuenta(e, r.id);
  assert.deepEqual(v.jugadores.map((j) => j.pagoCon), ["MP", "Efectivo", null, null], "cada fila con SU medio; la 3 y la 4 sin medio");
  assert.deepEqual(v.jugadores.map((j) => j.aPagar), [0, 0, 10500, 10500]);
  assert.equal(r.pagos.some((p) => p.jugador === 2 || p.jugador === 3), false, "a la 3 no se le cobró nada");
  // La 3 con transferencia: no hereda el efectivo de la 2.
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 2, medio: "transferencia" }, AHORA).ok, true);
  assert.equal(cuenta(e, r.id).jugadores[2].pagoCon, "Transf.");
  assert.equal(r.pagos.filter((p) => p.jugador === 2).every((p) => p.medio === "transferencia"), true);
});

test("BP-032 · créditos más el resto, en una acción: Beto usa sus $ 6.000 y paga $ 4.500 con el medio que elige", () => {
  const e = demo();
  const r = turnoDe42(e, { abrir: true });
  const beto = fichaConCreditos(e, 6000);
  assert.equal(ejecutar(e, r.id, { tipo: "sumarJugador", nombre: beto.nombre, clienteId: beto.id }, AHORA).ok, true);
  assert.equal(ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA).ok, true);
  const v = cuenta(e, r.id);
  assert.equal(v.jugadores[1].aPagar, 10500);
  assert.deepEqual(v.jugadores[1].creditosYResto, { usa: 6000, resto: 4500 }, "se ofrece usar $ 6.000 y cobrar $ 4.500");
  assert.equal(v.jugadores[0].creditosYResto, null, "sin ficha no hay créditos");
  assert.deepEqual(partirConCreditos(e, r.id, 1), { ok: true, de: beto.nombre, usa: 6000, resto: 4500, total: 10500 });

  // Si los créditos cambiaron entre que se mostró y el toque, no se cobra lo viejo.
  const ingresos = caja(e);
  const vieja = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "monedero", resto: "efectivo", usa: 5000 }, AHORA);
  assert.equal(vieja.ok, false);
  assert.equal(beto.monedero, 6000, "no tocó los créditos");
  assert.equal(caja(e), ingresos, "ni la caja");

  const tr = porMedio(e, "transferencia");
  const d = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "monedero", resto: "transferencia", usa: 6000 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, `Cobrado $ 10.500 a ${beto.nombre}: $ 6.000 con sus créditos y $ 4.500 en Transferencia.`);
  assert.equal(beto.monedero, 0, "usó todos sus créditos, sin quedar negativo");
  assert.equal(porMedio(e, "transferencia") - tr, 4500, "a la caja entra sólo el resto");
  assert.equal(caja(e) - ingresos, 4500);
  const despues = cuenta(e, r.id);
  assert.equal(despues.jugadores[1].aPagar, 0);
  assert.equal(despues.jugadores[1].pagoCon, "Créditos + Transf.");
  assert.deepEqual([0, 2, 3].map((i) => despues.jugadores[i].aPagar), [10500, 10500, 10500], "los demás deben lo mismo");
  assert.equal(sumaAPagar(despues), 42000 - 10500);
});

test("créditos más el resto con cargos: los créditos cubren su cancha y una parte de sus cargos; si no se puede partir justo, no toca nada", () => {
  const e = demo();
  const r = turnoDe42(e, { abrir: true });
  const beto = fichaConCreditos(e, 12000);
  assert.equal(ejecutar(e, r.id, { tipo: "sumarJugador", nombre: beto.nombre, clienteId: beto.id }, AHORA).ok, true);
  assert.equal(ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA).ok, true);
  const precio = cargar(e, r, 1);
  const total = 10500 + precio;
  assert.ok(total > 12000, "le debe más de lo que tiene en créditos");
  const ingresos = caja(e);
  const d = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "monedero", resto: "debito", usa: 12000 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(beto.monedero, 0);
  assert.equal(caja(e) - ingresos, total - 12000);
  assert.equal(cuenta(e, r.id).jugadores[1].aPagar, 0);

  // Beto paga además la cancha de Jugador 3 y tiene más créditos que su parte: no hay dónde poner lo que sobra → no se
  // parte (el ensayo sobre la copia lo frena) y la plata queda como estaba.
  const e2 = demo();
  const r2 = turnoDe42(e2, { abrir: true });
  const b2 = fichaConCreditos(e2, 15000);
  assert.equal(ejecutar(e2, r2.id, { tipo: "sumarJugador", nombre: b2.nombre, clienteId: b2.id }, AHORA).ok, true);
  assert.equal(ejecutar(e2, r2.id, { tipo: "dividir", n: 4 }, AHORA).ok, true);
  assert.equal(ejecutar(e2, r2.id, { tipo: "aCargoCancha", idx: 2, de: "1" }, AHORA).ok, true);
  assert.equal(cuenta(e2, r2.id).jugadores[1].aPagar, 21000);
  const foto = JSON.stringify(e2);
  const no = ejecutar(e2, r2.id, { tipo: "cobrarJugador", idx: 1, medio: "monedero", resto: "efectivo", usa: 15000 }, AHORA);
  assert.equal(no.ok, false);
  assert.match(no.mensaje, /No se pueden partir así/);
  assert.equal(JSON.stringify(e2), foto, "o sale entero o no sale: nada cambió");
  // Si le alcanzan los créditos, va el cobro con créditos de siempre (con su paso previo).
  b2.monedero = 30000;
  assert.equal(cuenta(e2, r2.id).jugadores[1].creditosYResto, null);
  assert.equal(partirConCreditos(e2, r2.id, 1).ok, false);
});

test("BP-033 · con la seña de $ 21.000 pagada por el titular, dividir entre 4: el titular debe $ 0 y los otros 3 se reparten $ 21.000", () => {
  const e = demo();
  const r = turnoDe42(e);
  r.sena = { monto: 21000, pagada: false };
  const s = ejecutar(e, r.id, { tipo: "cobrarSena", medio: "efectivo" }, AHORA);
  assert.equal(s.ok, true, s.mensaje);
  const d = ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, "Dividido entre 4: Pedro ya pagó; los otros 3, $ 7.000 cada uno.");
  const v = cuenta(e, r.id);
  assert.deepEqual(v.jugadores.map((j) => j.aPagar), [0, 7000, 7000, 7000]);
  assert.equal(sumaAPagar(v), 21000);
  assert.equal(v.jugadores[0].pagoCon, "Efectivo", "la seña cuenta como pago del titular");
});

test("BP-034 (parte de 1C) · dividido y pago, «la mesa sigue»: la cancha queda libre y la mesa sigue abierta", () => {
  const e = demo();
  const r = turnoDe42(e, { abrir: true });
  assert.equal(ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA).ok, true);
  for (const [i, m] of [[0, "mercadopago"], [1, "efectivo"], [2, "transferencia"], [3, "debito"]] as const) {
    assert.equal(ejecutar(e, r.id, { tipo: "cobrarJugador", idx: i, medio: m }, AHORA).ok, true);
  }
  const v = cuenta(e, r.id);
  assert.equal(v.totales.pendiente, 0);
  assert.equal(v.cierres.cerrarYSeguir, 0, "pago entero: «Cerrar la cancha · la mesa sigue» sin cobrar nada");
  const d = ejecutar(e, r.id, { tipo: "cerrarYSeguir", medio: "efectivo" }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const despues = cuenta(e, r.id);
  assert.equal(despues.abierto, false, "la cancha quedó libre");
  assert.equal(despues.mesaAbierta, true, "la mesa sigue");
  assert.equal(despues.jugadores.length, 4, "con los 4");
});

// ── BP-005/006 · «Cobrar la seña y abrir» (cert de la Tanda 1, F2) ────────────────────────────────────────────────
/** Un turno de hoy a las 21:00, con seña pendiente, en una cancha que no tiene a nadie jugando (se puede abrir a las 20:55). */
function conSenaPendiente(e: EstadoClub): Reserva {
  const libre = e.canchas.find((c) => M.validarHueco(e, { canchaId: c.id, fecha: HOY, inicio: 21 * 60, duracion: 60 }).ok);
  assert.ok(libre, "la demo tiene una cancha libre a las 21:00");
  // Los de las 19:00 ya se fueron (en la demo siguen «en cancha» a las 19:10): la cancha queda para abrir.
  e.reservas = e.reservas.filter((x) => !(x.fecha === HOY && x.canchaId === libre.id && x.estado === "en_cancha"));
  const res = M.crearReserva(e, { canchaId: libre.id, fecha: HOY, inicio: 21 * 60, duracion: 60, titular: "Pedro Paz", clienteId: null, conSena: true }, AHORA);
  assert.ok(res.ok, "se creó el turno");
  const r = (res as { reserva: Reserva }).reserva;
  assert.ok(r.sena.monto > 0 && !r.sena.pagada, "con la seña pendiente");
  return r;
}
const A_LAS_2055: Ahora = { fecha: HOY, min: 20 * 60 + 55 };
const recepcion = (e: EstadoClub) => operadorDeLaDemo(e, "RECEPTION")!.auth;

test("BP-005: con la seña pendiente la cuenta ofrece «Cobrar la seña y abrir» y NO «Abrir la cancha»; paga, vuelve «Abrir la cancha»", () => {
  const e = demo();
  const r = conSenaPendiente(e);
  const c = armarCuenta(e, r.id)!;
  assert.equal(c.cierres.abrirCancha, false, "no «Abrir la cancha» (diría «Falta la seña»)");
  assert.equal(c.cierres.cobrarSenaYAbrir, r.sena.monto);
  // En una cancha libre (con la cancha ocupada por el anterior va «Cerrar la de X y abrir», Tanda 2D).
  const sinSena = e.reservas.find((x) => x.fecha === HOY && x.estado === "reservada" && !(x.sena.monto > 0) && !canchaOcupada(e, x))!;
  assert.equal(armarCuenta(e, sinSena.id)!.cierres.abrirCancha, true);
  assert.equal(armarCuenta(e, sinSena.id)!.cierres.cobrarSenaYAbrir, null);
  // Cobrar sólo la seña (por teléfono, antes de llegar): ya no hay seña pendiente y vuelve «Abrir la cancha».
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarSena", medio: "efectivo" }, AHORA, recepcion(e)).ok, true);
  assert.equal(armarCuenta(e, r.id)!.cierres.abrirCancha, true);
  assert.equal(armarCuenta(e, r.id)!.cierres.cobrarSenaYAbrir, null);
});

test("BP-006: «Cobrar la seña y abrir» con transferencia — en cancha, luz prendida, la caja suma la seña por transferencia; el doble toque no cobra dos veces", () => {
  const e = demo();
  const r = conSenaPendiente(e);
  const tr0 = M.resumenCaja(e).porMedio.transferencia ?? 0;
  const ing0 = M.resumenCaja(e).ingresos;
  // Temprano (el club deja entrar 15 min antes): no abre y NO cobra. O pasan las dos cosas o ninguna.
  e.config.politica.minutosAntesParaEntrar = 15;
  const temprano = ejecutar(e, r.id, { tipo: "cobrarSenaYAbrir", medio: "transferencia" }, AHORA, recepcion(e));
  assert.equal(temprano.ok, false);
  assert.match(temprano.mensaje, /temprano/);
  assert.equal(M.resumenCaja(e).ingresos, ing0, "no se cobró nada");
  const d = ejecutar(e, r.id, { tipo: "cobrarSenaYAbrir", medio: "transferencia" }, A_LAS_2055, recepcion(e));
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.mensaje, `Seña cobrada: ${M.pesos(r.sena.monto)} (Transferencia). Cancha abierta y luz prendida.`);
  const vivo = M.reserva(e, r.id)!;
  assert.equal(vivo.estado, "en_cancha");
  assert.equal(e.luces[vivo.canchaId], true);
  assert.equal((M.resumenCaja(e).porMedio.transferencia ?? 0) - tr0, r.sena.monto, "la caja tiene la seña por transferencia");
  // Doble toque: no se cobra otra vez.
  const otra = ejecutar(e, r.id, { tipo: "cobrarSenaYAbrir", medio: "transferencia" }, A_LAS_2055, recepcion(e));
  assert.equal(otra.ok, false);
  assert.equal(M.resumenCaja(e).ingresos - ing0, r.sena.monto, "una sola vez");
  // Con créditos no va por acá (se cobra la seña sola, con su paso previo).
  assert.equal(ejecutar(demo(), r.id, { tipo: "cobrarSenaYAbrir", medio: "monedero" as never }, A_LAS_2055).ok, false);
});

// ── Dictamen v5 (BP-101): idempotencia de la pausa, un solo guardián del fijo nuevo, baja que devuelve lo liberado ──
{
  const HOY = "2026-10-17";
  const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
  const k = 3;
  const d = (i: number) => M.sumarDias(HOY, k + 7 * i);
  function base(semanas = 14) {
    const e = M.generarDemo(HOY, AHORA.min) as EstadoClub;
    const dia = M.diaSemana(d(0));
    const canchaId = e.canchas.find((c) => Array.from({ length: semanas }, (_, i) => i).every((i) => M.validarHueco(e, { canchaId: c.id, fecha: d(i), inicio: 22 * 60, duracion: 60 }).ok))!.id;
    const f = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Juan Fijo", desde: HOY });
    M.materializarFijosHasta(e, HOY, 14);
    return { e, f, canchaId, dia };
  }
  /** Estado heredado (fijo de Pedro dentro de la pausa de Juan) como lo deja la UI vieja o una réplica. Por defecto
   * Pedro juega sólo d(4) y d(5) (choque acotado: Juan vuelve el d(6)); `{}` = Pedro permanente. */
  function conPedro(desde = d(4), extra: Partial<Fijo> = { hasta: d(5) } as Partial<Fijo>) {
    const b = base();
    ejecutarBajaFijo(b.e, { tipo: "pausa", fijoId: b.f.id, desde: HOY, hasta: d(10) }, AHORA);
    const P = M.crearFijo(b.e, { clienteId: null, canchaId: b.canchaId, dia: b.dia, inicio: 22 * 60, duracion: 60, titular: "Pedro Nuevo", desde });
    Object.assign(P, extra);
    return { ...b, P, acortar: { tipo: "pausa" as const, fijoId: b.f.id, desde: HOY, hasta: M.sumarDias(d(4), -1) } };
  }
  /** Pares de fijos permanentes que juegan la misma fecha en el mismo hueco (próximas 80 semanas). */
  function solapes(e: EstadoClub, f: Fijo) {
    const out: string[] = [];
    for (let i = 0; i < 80; i++) {
      const fecha = M.sumarDias(HOY, k + 7 * i);
      if (!M.fijoJuegaEl(f, fecha)) continue;
      const o = otroFijoQuePisa({ ...e, reservas: [] } as EstadoClub, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion }, f.id);
      if (o) out.push(`${fecha}:${o.titular}`);
    }
    return out;
  }

  const GUARDIAN = /^Ese horario ya es del fijo de Juan Fijo \(martes 22:00; lo juega el .*\)\. Elegí otro día, hora o cancha\./;

  test("v5-10 «Hacer fijo» un turno suelto en el hueco de Juan pausado: el guardián lo frena", () => {
    const { e, f, canchaId } = base();
    ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: d(10) }, AHORA);
    const t = M.crearReserva(e, { canchaId, fecha: d(0), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Pedro Suelto" }, AHORA);
    assert.equal(t.ok, true);
    const antes = JSON.stringify(e);
    const r = ejecutar(e, (t as { reserva: { id: string } }).reserva.id, { tipo: "hacerFijo" }, AHORA);
    assert.equal(r.ok, false);
    assert.match(r.mensaje, GUARDIAN);
    assert.equal(JSON.stringify(e), antes);
    assert.equal(e.fijos.some((x) => x.titular === "Pedro Suelto"), false);
  });
}

// ── Tanda B4 (C5): «Jugador 2/3/4» dice quién es al cobrar; queda en la caja y en la ficha ──────────────────────────

test("B4-C5 · al cobrar a «Jugador 2» se pone nombre y teléfono: queda en la fila, en el movimiento de la caja y en una ficha nueva", () => {
  const e = demo();
  const r = turnoDe42(e);
  assert.equal(ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA).ok, true);
  const v = cuenta(e, r.id);
  assert.equal(v.jugadores[1].pideQuien, true);
  assert.equal(v.jugadores[0].pideQuien, false);
  const fichas = e.clientes.length;
  const movs = e.caja.movimientos.length;
  // Con créditos (sin ficha no tiene): el cobro no pasa y el jugador vuelve a llamarse «Jugador 2».
  const mal = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "monedero", quien: { nombre: "Pedro Paz", tel: "11 5555-1234" } }, AHORA);
  assert.equal(mal.ok, false);
  assert.equal(r.jugadores[1].nombre, "Jugador 2");
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "efectivo", quien: { tel: "123" } }, AHORA).ok, false, "teléfono corto");
  const d = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "efectivo", quien: { nombre: "Pedro Paz", tel: "11 5555-1234" } }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /a Pedro Paz/);
  assert.equal(r.jugadores[1].nombre, "Pedro Paz");
  assert.equal(e.clientes.length, fichas + 1, "ficha nueva");
  assert.equal(r.jugadores[1].clienteId, e.clientes.at(-1)!.id);
  assert.ok(e.caja.movimientos.length > movs);
  assert.ok(e.caja.movimientos.slice(movs).every((m) => m.jugador === "Pedro Paz (11 5555-1234)"));
  // «Jugador 3» con una ficha que ya existe (sugerida por el teléfono): se vincula, sin ficha nueva.
  const existente = e.clientes.find((c) => c.activo !== false && c.tel && !r.jugadores.some((j) => j.clienteId === c.id))!;
  const sug = sugerirFichas(e, existente.tel.slice(-6));
  assert.ok(sug.some((x) => x.id === existente.id), "la ficha se sugiere por el teléfono");
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 2, medio: "efectivo", quien: { tel: existente.tel } }, AHORA).ok, true);
  assert.equal(r.jugadores[2].clienteId, existente.id);
  assert.equal(r.jugadores[2].nombre, existente.nombre);
  assert.equal(e.clientes.length, fichas + 1);
  // Con el club pidiéndolo (`config.caja.pedirNombreJugador`), «Jugador 4» sin nombre no se cobra.
  e.config.caja = { pedirNombreJugador: true };
  const sinQuien = ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 3, medio: "efectivo" }, AHORA);
  assert.equal(sinQuien.ok, false);
  assert.match(sinQuien.mensaje, /¿Quién es Jugador 4\?/);
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 3, medio: "efectivo", quien: { nombre: "Lola" } }, AHORA).ok, true);
  assert.equal(r.jugadores[3].nombre, "Lola");
  assert.equal(r.jugadores[3].clienteId ?? null, null, "con el nombre solo no se hace ficha (no se duplican)");
});

test("B4-C5 (vuelta 4) · «Sólo la cancha» de «Jugador N» también pide quién es: no esquiva `pedirNombreJugador` y el nombre queda en la caja", () => {
  const e = demo();
  const r = turnoDe42(e);
  assert.equal(ejecutar(e, r.id, { tipo: "dividir", n: 4 }, AHORA).ok, true);
  e.config.caja = { pedirNombreJugador: true };
  const fichas = e.clientes.length;
  const movs = e.caja.movimientos.length;
  // Ataque: cobrar sólo la parte de la cancha, sin decir quién es, con el club pidiéndolo.
  const sinQuien = ejecutar(e, r.id, { tipo: "cobrarParte", idx: 1, medio: "efectivo" }, AHORA);
  assert.equal(sinQuien.ok, false, sinQuien.mensaje);
  assert.match(sinQuien.mensaje, /¿Quién es Jugador 2\?/);
  assert.equal(e.caja.movimientos.length, movs, "no entró plata a la caja");
  assert.equal(r.jugadores[1].saldado ?? false, false);
  // Si el cobro no pasa (con créditos, sin ficha no tiene), el jugador vuelve a ser «Jugador 2».
  const mal = ejecutar(e, r.id, { tipo: "cobrarParte", idx: 1, medio: "monedero", quien: { nombre: "Pedro Paz", tel: "11 5555-1234" } }, AHORA);
  assert.equal(mal.ok, false);
  assert.equal(r.jugadores[1].nombre, "Jugador 2");
  assert.equal(r.jugadores[1].clienteId ?? null, null);
  assert.equal(e.clientes.length, fichas, "sin ficha nueva si no se cobró");
  // Con nombre y teléfono: se cobra la parte, queda en el movimiento de la caja y en una ficha nueva.
  const d = ejecutar(e, r.id, { tipo: "cobrarParte", idx: 1, medio: "efectivo", quien: { nombre: "Pedro Paz", tel: "11 5555-1234" } }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /de Pedro Paz/);
  assert.equal(r.jugadores[1].nombre, "Pedro Paz");
  assert.equal(e.clientes.length, fichas + 1);
  assert.equal(r.jugadores[1].clienteId, e.clientes.at(-1)!.id);
  const nuevos = e.caja.movimientos.slice(movs);
  assert.equal(nuevos.length, 1);
  assert.equal(nuevos[0].jugador, "Pedro Paz (11 5555-1234)");
  // Sin el club pidiéndolo, «Sólo la cancha» sin nombre sigue como siempre.
  e.config.caja = { pedirNombreJugador: false };
  assert.equal(ejecutar(e, r.id, { tipo: "cobrarParte", idx: 2, medio: "efectivo" }, AHORA).ok, true);
  assert.equal(r.jugadores[2].nombre, "Jugador 3");
});
