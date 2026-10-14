// Tests del motor del club de Break Point (public/previews/breakpoint/club/motor.mjs).
// Cubren las eventualidades de la matriz de docs/tenants/breakpoint/REINGENIERIA.md §4: cada regla que
// la recepcionista va a usar con gente esperando en el mostrador tiene que estar probada acá.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as motor from "../../../public/previews/breakpoint/club/motor.mjs";

// El motor es JS plano (el navegador lo carga tal cual, sin build): los tipos que TypeScript infiere del JS
// son demasiado estrechos para un test que arma escenarios a mano, así que acá se usa sin tipar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M: any = motor;

const HOY = "2026-10-14"; // miércoles
const ahora = (hh: number, mm = 0) => ({ fecha: HOY, min: hh * 60 + mm });

function club() {
  return M.crearEstado({
    config: M.CONFIG_DEMO,
    canchas: M.CANCHAS_DEMO,
    clientes: [
      { id: "a", nombre: "Ana", tel: "5491100000001", socio: false, strikes: 0, monedero: 0, deuda: 0, nivel: "" },
      { id: "b", nombre: "Beto", tel: "5491100000002", socio: true, strikes: 0, monedero: 10000, deuda: 0, nivel: "" },
      { id: "c", nombre: "Caro", tel: "5491100000003", socio: false, strikes: 2, monedero: 0, deuda: 0, nivel: "" },
    ],
    productos: M.PRODUCTOS_DEMO,
  });
}

test("precio: integra valle y pico minuto a minuto, socio con descuento, finde todo pico", () => {
  const e = club();
  // 16:00–17:30 → 60 min valle (20.000) + 30 min pico (14.000)
  assert.equal(M.precioTurno(e, { fecha: HOY, inicio: 16 * 60, duracion: 90, canchaId: "c1" }, "a"), 34000);
  assert.equal(M.precioTurno(e, { fecha: HOY, inicio: 16 * 60, duracion: 90, canchaId: "c1" }, "b"), 28900);
  assert.equal(M.precioTurno(e, { fecha: "2026-10-17", inicio: 10 * 60, duracion: 90, canchaId: "c1" }, "a"), 42000);
});

test("no hay doble reserva: el hueco ocupado se rechaza con el nombre de quién lo tiene", () => {
  const e = club();
  assert.ok(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).ok);
  const choque = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 21 * 60, clienteId: "b" }, ahora(10));
  assert.equal(choque.ok, false);
  assert.match(choque.motivo, /Ana/);
  // Pegado al final sí se puede (20:00–21:30 y 21:30–23:00).
  assert.ok(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 21 * 60 + 30, clienteId: "b" }, ahora(10)).ok);
});

test("horario, grilla, mantenimiento y turnos en el pasado", () => {
  const e = club();
  assert.match(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 7 * 60, titular: "X" }, ahora(6)).motivo, /abre/);
  assert.match(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60 + 15, titular: "X" }, ahora(6)).motivo, /cada 30/);
  assert.match(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 9 * 60, titular: "X" }, ahora(12)).motivo, /pasó/);
  e.canchas[0].estado = "mantenimiento";
  assert.match(M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, titular: "X" }, ahora(6)).motivo, /mantenimiento/);
  // El turno que cruza la medianoche entra (el club cierra a la 01:00).
  assert.ok(M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 23 * 60 + 30, titular: "X" }, ahora(6)).ok);
});

test("seña: obligatoria para reincidentes y sin cliente; sin seña no se da la cancha", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "c" }, ahora(10)).reserva;
  assert.equal(r.sena.monto, 21000);
  assert.equal(M.checkIn(e, r.id, ahora(20)).ok, false);
  assert.ok(M.registrarPago(e, r.id, { medio: "transferencia", monto: 21000 }, ahora(11)).ok);
  assert.equal(r.sena.pagada, true);
  assert.ok(M.checkIn(e, r.id, ahora(20)).ok);
  assert.equal(e.luces.c1, true);
  const sinCliente = M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 20 * 60, titular: "Walk-in" }, ahora(10)).reserva;
  assert.ok(sinCliente.sena.monto > 0);
  const normal = M.crearReserva(e, { canchaId: "c3", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  assert.equal(normal.sena.monto, 0);
});

test("cobro dividido en cuatro: las partes suman exacto y no se puede cobrar de más", () => {
  assert.deepEqual(M.dividir(42000, 4), [10500, 10500, 10500, 10500]);
  const partes = M.dividir(35710, 4);
  assert.equal(partes.reduce((s: number, x: number) => s + x, 0), 35710);
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  for (const [i, parte] of M.dividir(M.saldo(r), 4).entries()) M.registrarPago(e, r.id, { medio: "mercadopago", monto: parte, jugador: i }, ahora(20));
  assert.equal(M.saldo(r), 0);
  assert.equal(M.registrarPago(e, r.id, { medio: "efectivo", monto: 100 }, ahora(20)).ok, false);
});

test("saldo a favor: se descuenta del monedero y no entra a la caja (no es plata nueva)", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "b" }, ahora(10)).reserva;
  const antes = e.caja.movimientos.length;
  assert.ok(M.registrarPago(e, r.id, { medio: "monedero", monto: 10000 }, ahora(20)).ok);
  assert.equal(M.cliente(e, "b").monedero, 0);
  assert.equal(e.caja.movimientos.length, antes);
  assert.equal(M.registrarPago(e, r.id, { medio: "monedero", monto: 1000 }, ahora(20)).ok, false);
});

test("cancelación a tiempo: lo pagado vuelve como saldo a favor", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 22 * 60, clienteId: "c" }, ahora(8)).reserva;
  M.registrarPago(e, r.id, { medio: "transferencia", monto: r.sena.monto }, ahora(8));
  const res = M.cancelar(e, r.id, {}, ahora(9)); // 13 h de aviso ≥ 12 h
  assert.equal(res.aTiempo, true);
  assert.equal(M.cliente(e, "c").monedero, r.sena.monto);
});

test("cancelación tardía: seña en suspenso que se libera sola si el hueco se vuelve a vender", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 22 * 60, clienteId: "c" }, ahora(8)).reserva;
  M.registrarPago(e, r.id, { medio: "transferencia", monto: r.sena.monto }, ahora(8));
  const res = M.cancelar(e, r.id, {}, ahora(20));
  assert.equal(res.aTiempo, false);
  assert.equal(res.enSuspenso, true);
  assert.equal(M.cliente(e, "c").monedero, 0);
  const relleno = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 22 * 60, clienteId: "a" }, ahora(20, 30));
  assert.equal(relleno.liberadas.length, 1);
  assert.equal(M.cliente(e, "c").monedero, r.sena.monto);
});

test("no-show: suma falta, libera la cancha y ofrece el hueco a la lista de espera", () => {
  const e = club();
  M.anotarEspera(e, { clienteId: "b", titular: "Beto", tel: "1", fecha: HOY, desde: 19 * 60, hasta: 22 * 60 }, ahora(12));
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  const res = M.marcarNoShow(e, r.id, ahora(20, 20));
  assert.equal(M.cliente(e, "a").strikes, 1);
  assert.equal(res.ofertas.length, 1);
  assert.match(res.ofertas[0].mensaje, /Beto/);
  assert.ok(M.asignarDesdeEspera(e, res.ofertas[0].id, { canchaId: "c1", inicio: 20 * 60 }, ahora(20, 21)).ok);
  assert.equal(e.espera.length, 0);
});

test("plan lluvia: primero mueve a una techada libre, si no hay suspende y acredita lo pagado", () => {
  const e = club();
  const enDescubierta1 = M.crearReserva(e, { canchaId: "c4", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  const enDescubierta2 = M.crearReserva(e, { canchaId: "c4", fecha: HOY, inicio: 21 * 60 + 30, clienteId: "b" }, ahora(10)).reserva;
  M.registrarPago(e, enDescubierta2.id, { medio: "efectivo", monto: 5000 }, ahora(11));
  for (const c of ["c1", "c2", "c3"]) M.crearReserva(e, { canchaId: c, fecha: HOY, inicio: 21 * 60 + 30, titular: `Ocupa ${c}` }, ahora(10));
  const { resultado } = M.planLluvia(e, HOY, 19 * 60 + 30, 24 * 60, ahora(19));
  assert.equal(resultado.find((x: { reservaId: string }) => x.reservaId === enDescubierta1.id).accion, "movido");
  assert.notEqual(enDescubierta1.canchaId, "c4");
  assert.equal(enDescubierta2.estado, "suspendida");
  assert.equal(M.cliente(e, "b").monedero, 15000);
});

test("corte de luz: se reconoce en proporción el tiempo no jugado", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  M.registrarPago(e, r.id, { medio: "efectivo", monto: r.precio }, ahora(20));
  M.checkIn(e, r.id, ahora(20));
  const res = M.interrumpir(e, r.id, "corte de luz", ahora(21));
  assert.equal(res.noJugados, 30);
  assert.equal(res.credito, 14000);
  assert.equal(M.cliente(e, "a").monedero, 14000);
});

test("extender: sólo si el hueco siguiente está libre, y cobra la diferencia", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 19 * 60, clienteId: "a" }, ahora(10)).reserva;
  const ext = M.extender(e, r.id, 30, ahora(20));
  assert.ok(ext.ok);
  assert.equal(r.duracion, 120);
  M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 21 * 60, titular: "Otro" }, ahora(10));
  assert.equal(M.extender(e, r.id, 30, ahora(20)).ok, false);
});

test("cerrar turno: no se cierra con saldo salvo a cuenta del cliente; lo alquilado vuelve al stock", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  M.agregarConsumo(e, r.id, "p6", 2, ahora(20));
  assert.equal(M.producto(e, "p6").stock, 6);
  assert.equal(M.finalizar(e, r.id, {}, ahora(21, 30)).ok, false);
  assert.ok(M.finalizar(e, r.id, { dejarDeuda: true }, ahora(21, 30)).ok);
  assert.equal(M.cliente(e, "a").deuda, M.totalReserva(r));
  assert.equal(M.producto(e, "p6").stock, 8);
  // Con deuda, la próxima reserva le pide seña.
  assert.ok(M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 22 * 60, clienteId: "a" }, ahora(21, 30)).reserva.sena.monto > 0);
});

test("turno fijo: se materializa una vez, y 'esta semana no venimos' libera sin darlo de baja", () => {
  const e = club();
  const f = M.crearFijo(e, { clienteId: "b", canchaId: "c2", dia: M.diaSemana(HOY), inicio: 21 * 60 });
  M.materializarFijos(e, HOY);
  M.materializarFijos(e, HOY);
  assert.equal(e.reservas.filter((r: { fijoId: string }) => r.fijoId === f.id).length, 1);
  assert.ok(M.liberarFijo(e, f.id, HOY, ahora(8)).ok);
  assert.equal(e.fijos.length, 1);
  assert.ok(M.validarHueco(e, { canchaId: "c2", fecha: HOY, inicio: 21 * 60, duracion: 90 }).ok);
  // La semana que viene vuelve a aparecer.
  M.materializarFijos(e, M.sumarDias(HOY, 7));
  assert.equal(e.reservas.filter((r: { fijoId: string; fecha: string }) => r.fijoId === f.id && r.fecha === M.sumarDias(HOY, 7)).length, 1);
});

test("bloqueo: no pisa turnos existentes", () => {
  const e = club();
  M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, titular: "X" }, ahora(10));
  assert.equal(M.bloquear(e, { canchaId: "c1", fecha: HOY, desde: 19 * 60, hasta: 21 * 60, motivo: "Cambio de red" }, ahora(10)).ok, false);
  assert.ok(M.bloquear(e, { canchaId: "c2", fecha: HOY, desde: 19 * 60, hasta: 21 * 60, motivo: "Cambio de red" }, ahora(10)).ok);
  assert.equal(M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 20 * 60, titular: "Y" }, ahora(10)).ok, false);
});

test("caja: arqueo con diferencia explícita; la venta de mostrador no acepta alquileres", () => {
  const e = club();
  e.caja.fondo = 10000;
  assert.ok(M.ventaMostrador(e, [{ productoId: "p2", cant: 3 }], "efectivo", ahora(18)).ok);
  assert.equal(M.ventaMostrador(e, [{ productoId: "p6", cant: 1 }], "efectivo", ahora(18)).ok, false);
  assert.ok(M.egresoCaja(e, { monto: 1500, concepto: "Hielo" }, ahora(18)).ok);
  const { cierre } = M.cerrarCaja(e, { contado: 14000, responsable: "Mica" }, ahora(23));
  assert.equal(cierre.esperado, 14500);
  assert.equal(cierre.diferencia, -500);
});

test("demo: el día arranca con cada eventualidad en la bandeja y nada se pisa", () => {
  const e = M.generarDemo(HOY);
  const tipos = new Set(M.alertas(e, ahora(19, 10)).map((a: { tipo: string }) => a.tipo));
  for (const t of ["cerrar", "no_show", "sena", "lluvia", "luz", "espera", "stock"]) assert.ok(tipos.has(t), `falta la alerta ${t}`);
  // Invariante: ningún par de turnos activos se superpone en la misma cancha.
  const activos = e.reservas.filter((r: { estado: string }) => ["reservada", "en_cancha", "finalizada"].includes(r.estado));
  for (const a of activos)
    for (const b of activos)
      if (a !== b && a.fecha === b.fecha && a.canchaId === b.canchaId)
        assert.ok(a.inicio + a.duracion <= b.inicio || b.inicio + b.duracion <= a.inicio, `${a.titular} pisa a ${b.titular}`);
  const k = M.kpis(e, HOY, ahora(19, 10));
  assert.ok(k.ocupacion > 0 && k.ocupacion <= 1);
  // Mismo día → misma demo (semilla).
  assert.equal(M.generarDemo(HOY).reservas.length, e.reservas.length);
});

test("WhatsApp: el link lleva el número limpio y el texto codificado", () => {
  const url = M.linkWhatsApp("+54 9 11 0000-0001", M.mensajeWhatsApp("recordatorio", { nombre: "Ana", hora: "20:00", cancha: "Cancha 1" }));
  assert.match(url, /^https:\/\/wa\.me\/5491100000001\?text=/);
  assert.match(decodeURIComponent(url), /Ana/);
});

// ── Hallazgos del Gate (2026-10-14): cada uno queda cubierto para que no vuelva al portar el motor ──

test("dar la cancha: no antes de 30 min, no con el turno terminado, no con la cancha ocupada", () => {
  const e = club();
  const a = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  const b = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 21 * 60 + 30, clienteId: "b" }, ahora(10)).reserva;
  assert.match(M.checkIn(e, a.id, ahora(17)).motivo, /temprano/);
  assert.ok(M.checkIn(e, a.id, ahora(19, 40)).ok);
  // El siguiente llega temprano y el anterior sigue en cancha: no se superponen.
  assert.match(M.checkIn(e, b.id, ahora(21, 10)).motivo, /sigue ocupada/);
  assert.match(M.checkIn(e, M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 8 * 60, clienteId: "a" }).reserva.id, ahora(12)).motivo, /terminó/);
});

test("'no vino' sólo pasada la tolerancia, y lo alquilado vuelve al stock", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  M.agregarConsumo(e, r.id, "p6", 2, ahora(10));
  assert.equal(M.marcarNoShow(e, r.id, ahora(20, 5)).ok, false);
  assert.equal(M.cliente(e, "a").strikes, 0);
  assert.ok(M.marcarNoShow(e, r.id, ahora(20, 15)).ok);
  assert.equal(M.producto(e, "p6").stock, 8);
});

test("cancelar a tiempo sin ficha: queda la devolución anotada y se registra al devolverla", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 22 * 60, titular: "Walk-in" }, ahora(8)).reserva;
  M.registrarPago(e, r.id, { medio: "efectivo", monto: r.sena.monto }, ahora(8));
  M.agregarConsumo(e, r.id, "p6", 1, ahora(8));
  const res = M.cancelar(e, r.id, {}, ahora(9));
  assert.equal(res.devolverEnMano, r.sena.monto);
  assert.equal(M.producto(e, "p6").stock, 8);
  assert.ok(M.alertas(e, ahora(9)).some((x: { tipo: string }) => x.tipo === "devolucion"));
  assert.ok(M.marcarDevuelto(e, r.id, "efectivo", ahora(9, 30)).ok);
  assert.equal(M.resumenCaja(e, HOY).efectivoEsperado, 0);
  assert.equal(M.marcarDevuelto(e, r.id, "efectivo", ahora(9, 30)).ok, false);
});

test("interrupción: una sola vez y nunca con cero minutos jugados (sin NaN)", () => {
  const e = club();
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  M.checkIn(e, r.id, ahora(19, 50));
  assert.match(M.interrumpir(e, r.id, "corte de luz", ahora(19, 55)).motivo, /no empezaron/);
  assert.ok(M.interrumpir(e, r.id, "corte de luz", ahora(20, 30)).ok);
  assert.equal(M.interrumpir(e, r.id, "corte de luz", ahora(20, 40)).ok, false);
  assert.ok(Number.isFinite(r.precio) && r.precio > 0);
});

test("lluvia con el turno en juego: se reconoce sólo lo no jugado; lo consumido se sigue cobrando", () => {
  const e = club();
  for (const c of ["c1", "c2", "c3"]) M.crearReserva(e, { canchaId: c, fecha: HOY, inicio: 20 * 60, titular: `Ocupa ${c}` }, ahora(10));
  const r = M.crearReserva(e, { canchaId: "c4", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  M.checkIn(e, r.id, ahora(20));
  M.agregarConsumo(e, r.id, "p2", 4, ahora(20));
  M.agregarConsumo(e, r.id, "p6", 2, ahora(20));
  M.registrarPago(e, r.id, { medio: "efectivo", monto: M.saldo(r) }, ahora(20, 5));
  const { resultado } = M.planLluvia(e, HOY, 20 * 60 + 30, 24 * 60, ahora(20, 30));
  assert.equal(resultado[0].accion, "cortado");
  assert.equal(resultado[0].noJugados, 60);
  // Pagó turno (42.000) + agua (8.000) + palas (10.000); se le reconocen 2/3 del turno, no lo consumido.
  assert.equal(M.cliente(e, "a").monedero, 28000);
  assert.ok(M.finalizar(e, r.id, {}, ahora(20, 35)).ok);
  assert.equal(M.producto(e, "p6").stock, 8);
});

test("lluvia antes de empezar, sin ficha: no promete saldo a favor, anota la devolución", () => {
  const e = club();
  for (const c of ["c1", "c2", "c3"]) M.crearReserva(e, { canchaId: c, fecha: HOY, inicio: 21 * 60, titular: `Ocupa ${c}` }, ahora(10));
  const r = M.crearReserva(e, { canchaId: "c4", fecha: HOY, inicio: 21 * 60, titular: "Walk-in" }, ahora(10)).reserva;
  M.registrarPago(e, r.id, { medio: "efectivo", monto: r.sena.monto }, ahora(10));
  const { resultado } = M.planLluvia(e, HOY, 20 * 60, 24 * 60, ahora(19));
  assert.equal(resultado[0].credito, 0);
  assert.equal(resultado[0].devolverEnMano, r.sena.monto);
  assert.equal(r.devolucionPendiente, r.sena.monto);
});

test("caja: 'saldo a favor' no es un medio de cobro de mostrador ni de deudas", () => {
  const e = club();
  assert.equal(M.ventaMostrador(e, [{ productoId: "p2", cant: 1 }], "monedero", ahora(18)).ok, false);
  M.cliente(e, "a").deuda = 9000;
  assert.equal(M.cobrarDeuda(e, "a", "monedero", ahora(18)).ok, false);
  assert.ok(M.cobrarDeuda(e, "a", "mercadopago", ahora(18)).ok);
  assert.equal(M.cliente(e, "a").deuda, 0);
  assert.equal(M.resumenCaja(e, HOY).porMedio.mercadopago, 9000);
});

test("reglas del dueño con topes, jugadores y mercadería pasan por el motor", () => {
  const e = club();
  assert.equal(M.ajustarPolitica(e, "senaPct", 500).ok, false);
  assert.equal(e.config.politica.senaPct, 50);
  assert.ok(M.ajustarPolitica(e, "senaPct", 30).ok);
  const r = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 20 * 60, clienteId: "a" }, ahora(10)).reserva;
  for (const n of ["B", "C", "D"]) assert.ok(M.sumarJugador(e, r.id, n).ok);
  assert.equal(M.sumarJugador(e, r.id, "E").ok, false);
  assert.equal(M.ingresarStock(e, "p3", 0).ok, false);
  assert.equal(M.ingresarStock(e, "p3", 12).stock, 21);
});

test("tablero: 'por cobrar' es sólo lo que ya se juega, no los turnos de más tarde", () => {
  const e = club();
  const jugando = M.crearReserva(e, { canchaId: "c1", fecha: HOY, inicio: 19 * 60, clienteId: "a" }, ahora(10)).reserva;
  M.crearReserva(e, { canchaId: "c2", fecha: HOY, inicio: 22 * 60, clienteId: "a" }, ahora(10));
  M.checkIn(e, jugando.id, ahora(19));
  const k = M.kpis(e, HOY, ahora(19, 30));
  assert.equal(k.porCobrar, M.saldo(jugando));
  assert.ok(k.vendido > k.porCobrar);
});

test("demo: ningún turno de días pasados queda abierto", () => {
  const e = M.generarDemo(HOY);
  const abiertos = e.reservas.filter((r: { fecha: string; estado: string }) => r.fecha < HOY && ["reservada", "en_cancha"].includes(r.estado));
  assert.equal(abiertos.length, 0);
});
