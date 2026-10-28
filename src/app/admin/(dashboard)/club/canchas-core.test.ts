// Mantenimiento, bloqueos, turnos fijos y lista de espera contra el motor REAL sobre la demo.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import type { Fijo } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { DIAS_A_LA_VISTA, SE_DESHACE, bajaFijo, armarCanchas, armarEspera, armarFijos, bajarFijos, ejecutarBajaFijo, ejecutarCanchas, ejecutarEspera, fijosPorBajar, horasDelDia, nuevoFijo, otroFijoQuePisa, previaBajaFijo, textoAvisoBaja, vueltaDelFijo } from "./canchas-core";
import { armarAgenda } from "./agenda-core";
import { reservar } from "./alta-core";
import { avisosLluvia } from "./whatsapp-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): EstadoClub => M.generarDemo(HOY, AHORA.min);
// Break Point tiene las 4 techadas; la lluvia se prueba con la Cancha 4 descubierta (otro club).
const conDescubierta = (): EstadoClub => {
  const e = demo();
  M.configurarTecho(e, "c4", false, AHORA);
  return e;
};

test("mantenimiento: con motivo; la cancha deja de ofrecer huecos y vuelve al habilitarla", () => {
  const e = demo();
  assert.equal(ejecutarCanchas(e, { tipo: "mantenimiento", canchaId: "c3", activo: true, motivo: " " }, AHORA).ok, false);
  assert.equal(ejecutarCanchas(e, { tipo: "mantenimiento", canchaId: "c3", activo: true, motivo: "Cambio de césped" }, AHORA).ok, true);
  assert.equal(armarCanchas(e, HOY).canchas.find((c) => c.id === "c3")!.mantenimiento, "Cambio de césped");
  assert.ok(!armarAgenda(e, HOY, AHORA).libres.some((l) => l.canchaId === "c3"));
  assert.equal(ejecutarCanchas(e, { tipo: "mantenimiento", canchaId: "c3", activo: false, motivo: "" }, AHORA).ok, true);
  assert.ok(armarAgenda(e, HOY, AHORA).libres.some((l) => l.canchaId === "c3"));
});

test("bloquear no pisa turnos; bloqueado, no se da turno ahí; quitar el bloqueo lo libera", () => {
  const e = demo();
  const manana = M.sumarDias(HOY, 1);
  const pisa = ejecutarCanchas(e, { tipo: "bloquear", canchaId: "c1", fecha: HOY, desde: 17 * 60, hasta: 19 * 60, motivo: "Torneo" }, AHORA);
  assert.equal(pisa.ok, false);
  assert.match(pisa.mensaje, /movelos primero.*Martín Ríos/);
  assert.equal(ejecutarCanchas(e, { tipo: "bloquear", canchaId: "c1", fecha: manana, desde: 9 * 60, hasta: 12 * 60, motivo: "" }, AHORA).ok, false, "sin motivo no");
  assert.equal(ejecutarCanchas(e, { tipo: "bloquear", canchaId: "c1", fecha: manana, desde: 9 * 60, hasta: 12 * 60, motivo: "Torneo" }, AHORA).ok, true);
  assert.equal(M.validarHueco(e, { canchaId: "c1", fecha: manana, inicio: 10 * 60, duracion: 60 }).ok, false);
  const v = armarAgenda(e, manana, AHORA);
  assert.equal(v.bloqueos.length, 1);
  assert.ok(!v.libres.some((l) => l.canchaId === "c1" && l.min >= 9 * 60 && l.min < 12 * 60));
  const [b] = armarCanchas(e, HOY).bloqueos;
  assert.match(b.texto, /Torneo/);
  assert.equal(ejecutarCanchas(e, { tipo: "quitarBloqueo", bloqueoId: e.bloqueos[0].id }, AHORA).ok, true);
  assert.equal(M.validarHueco(e, { canchaId: "c1", fecha: manana, inicio: 10 * 60, duracion: 60 }).ok, true);
  assert.ok(horasDelDia(e, HOY).length > 10);
});

test("turno fijo: se valida la próxima vez que toca, se baja a la grilla de los próximos días y no se duplica", () => {
  const e = demo();
  const martes = 2;
  const ficha = e.clientes[3];
  const libre = [9 * 60, 10 * 60, 11 * 60].find((m) => {
    let d = HOY;
    while (M.diaSemana(d) !== martes) d = M.sumarDias(d, 1);
    return M.validarHueco(e, { canchaId: "c2", fecha: d, inicio: m, duracion: 60 }).ok;
  })!;
  const d = nuevoFijo(e, { titular: ficha.nombre, clienteId: ficha.id, canchaId: "c2", dia: martes, inicio: libre, duracion: 60 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const f = e.fijos.at(-1)!;
  const enGrilla = e.reservas.filter((r) => r.fijoId === f.id);
  assert.equal(enGrilla.length, Math.ceil(DIAS_A_LA_VISTA / 7), "una vez por semana a la vista");
  assert.equal(enGrilla[0].tipo, "fijo");
  assert.match(armarFijos(e, HOY).fijos.at(-1)!.proximas, /en la grilla/);
  const otra = bajarFijos(e, HOY);
  assert.equal(e.reservas.filter((r) => r.fijoId === f.id).length, enGrilla.length, "idempotente");
  assert.ok(otra.ok || /No entraron/.test(otra.mensaje));
  // Uno que choca no se crea.
  const choca = nuevoFijo(e, { titular: "Choca", clienteId: null, canchaId: "c2", dia: martes, inicio: libre, duracion: 60 }, AHORA);
  assert.equal(choca.ok, false);
  assert.match(choca.mensaje, /no entra/);
  assert.equal(nuevoFijo(e, { titular: " ", clienteId: null, canchaId: "c2", dia: martes, inicio: libre, duracion: 60 }, AHORA).ok, false);
});

test("lista de espera: los huecos que le sirven (ventana, duración, techada) y darle el turno la saca de la lista", () => {
  const e = demo();
  const { espera } = armarEspera(e, AHORA);
  assert.ok(espera.length >= 1);
  const manana = M.sumarDias(HOY, 1);
  assert.equal(ejecutarEspera(e, { tipo: "anotar", titular: "Ana Espera", clienteId: null, fecha: manana, desde: 18 * 60, hasta: 21 * 60, duracion: 90, soloCubierta: true }, AHORA).ok, true);
  const ana = armarEspera(e, AHORA).espera.find((x) => x.texto.startsWith("Ana Espera"))!;
  assert.ok(ana.huecos.length > 0);
  for (const h of ana.huecos) {
    assert.ok(h.inicio >= 18 * 60 && h.inicio <= 21 * 60);
    assert.equal(M.cancha(e, h.canchaId)!.cubierta, true, "sólo techada");
    assert.ok(M.validarHueco(e, { canchaId: h.canchaId, fecha: manana, inicio: h.inicio, duracion: 90 }).ok);
  }
  const [h] = ana.huecos;
  const d = ejecutarEspera(e, { tipo: "asignar", esperaId: ana.id, canchaId: h.canchaId, inicio: h.inicio }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(M.reserva(e, d.reservaId!));
  assert.ok(!armarEspera(e, AHORA).espera.some((x) => x.id === ana.id));
  assert.equal(ejecutarEspera(e, { tipo: "quitar", esperaId: ana.id }, AHORA).ok, false);
  assert.equal(ejecutarEspera(e, { tipo: "anotar", titular: "", clienteId: null, fecha: manana, desde: 1, hasta: 2, duracion: 60, soloCubierta: false }, AHORA).ok, false);
});

test("qué se deshace, como en el club vanilla: ni lluvia, ni mantenimiento, ni bloqueos, ni crear fijos, ni sacar de la espera; dar de baja un fijo SÍ (3C)", () => {
  for (const k of ["lluvia", "mantenimiento", "bloquear", "quitarBloqueo", "nuevoFijo", "bajarFijos", "quitar"] as const) assert.equal(SE_DESHACE[k], false, k);
  for (const k of ["anotar", "asignar", "bajaFijo", "pausaFijo", "liberarFijo"] as const) assert.equal(SE_DESHACE[k], true, k);
});

test("dar de baja un fijo (la inversa de crearlo): libera sus turnos sin jugar con la regla de «cancela el club» y sale de la lista", () => {
  const e = demo();
  const f = e.fijos[0];
  for (let d = 0; d < 7; d++) M.materializarFijos(e, M.sumarDias(HOY, d));
  const futuros = e.reservas.filter((r) => r.fijoId === f.id && r.estado === "reservada" && r.fecha >= HOY);
  assert.ok(futuros.length > 0);
  const d = bajaFijo(e, f.id, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(!e.fijos.some((x) => x.id === f.id));
  assert.ok(futuros.every((r) => r.estado === "cancelada"));
  assert.equal(bajaFijo(e, f.id, AHORA).ok, false);
});

test("techo: Break Point con las 4 techadas no tiene descubiertas; el dueño marca una y vuelve", () => {
  const e = demo();
  assert.equal(armarCanchas(e, HOY).descubiertas, 0);
  const d = ejecutarCanchas(e, { tipo: "techo", canchaId: "c4", cubierta: false }, AHORA);
  assert.deepEqual(d, { ok: true, mensaje: "Cancha 4: descubierta." });
  assert.equal(armarCanchas(e, HOY).descubiertas, 1);
  assert.equal(ejecutarCanchas(e, { tipo: "techo", canchaId: "nada", cubierta: true }, AHORA).ok, false);
  assert.equal(SE_DESHACE.techo, false);
});

test("plan lluvia: devuelve lo que pasó con cada turno y los avisos por WhatsApp salen de eso", () => {
  const e = conDescubierta();
  const d = ejecutarCanchas(e, { tipo: "lluvia", fecha: HOY, desde: 19 * 60 + 30, hasta: 23 * 60 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(d.lluvia && d.lluvia.length > 0, "la demo tiene turnos en la descubierta a la noche");
  const avisos = avisosLluvia(e, d.lluvia);
  assert.equal(avisos.length, d.lluvia.length);
  for (const a of avisos) {
    const x = d.lluvia.find((r) => r.reservaId === a.reservaId)!;
    if (x.accion === "cortado") assert.equal(a.texto, null, "estaban jugando: no hay aviso");
    else assert.match(a.texto!, new RegExp(`^¡Hola ${x.titular.split(" ")[0]}! Por la lluvia `));
  }
  // Sin turnos en ese horario: lista vacía, nada que avisar.
  const vacio = ejecutarCanchas(demo(), { tipo: "lluvia", fecha: HOY, desde: 8 * 60, hasta: 8 * 60 + 30 }, AHORA);
  assert.deepEqual(vacio.lluvia, []);
});

test("lista de espera: cada hueco trae la oferta por WhatsApp (texto del vanilla) y el celular de quien espera", () => {
  const e = demo();
  const { espera } = armarEspera(e, AHORA);
  const dani = espera.find((x) => x.titular === "Daniela Navarro")!;
  assert.ok(dani.huecos.length > 0);
  const h = dani.huecos[0];
  assert.equal(h.oferta, `¡Hola Daniela! Se liberó un turno: ${h.texto.replace(/ (\d\d:\d\d)$/, " a las $1")} (hoy). ¿Lo querés? Respondé SÍ y te lo reservamos.`);
  assert.equal(dani.celular, M.cliente(e, "k20")!.tel, "el de su ficha");
  // Anotado sin ficha con su celular: se usa ése; sin celular, queda vacío (WhatsApp abre para elegir el chat).
  const manana = M.sumarDias(HOY, 1);
  assert.equal(ejecutarEspera(e, { tipo: "anotar", titular: "Pocho", clienteId: null, fecha: manana, desde: 9 * 60, hasta: 12 * 60, duracion: 90, soloCubierta: false, tel: " 11 4000-7919 " }, AHORA).ok, true);
  assert.equal(ejecutarEspera(e, { tipo: "anotar", titular: "Sin cel", clienteId: null, fecha: manana, desde: 9 * 60, hasta: 12 * 60, duracion: 90, soloCubierta: false }, AHORA).ok, true);
  const despues = armarEspera(e, AHORA).espera;
  const pocho = despues.find((x) => x.titular === "Pocho")!;
  assert.equal(pocho.celular, "11 4000-7919");
  assert.match(pocho.huecos[0].oferta, /\(\w+ \d+\/\d+\)\. ¿Lo querés\?/, "otro día: con la fecha corta");
  assert.equal(despues.find((x) => x.titular === "Sin cel")!.celular, "");
});

test("baja de un fijo: «cancela el club» (devolver todo) sólo con un dueño; con recepción, la regla de siempre (21/10)", () => {
  const conPago = (auth?: M.Auth) => {
    const e = demo();
    const f = e.fijos[0];
    for (let d = 0; d < 7; d++) M.materializarFijos(e, M.sumarDias(HOY, d));
    // El turno fijo de hoy, pagado entero y a menos de 12 h: tarde para la regla del cliente.
    const r = e.reservas.find((x) => x.fijoId === f.id && x.estado === "reservada" && x.fecha >= HOY)!;
    M.registrarPago(e, r.id, { medio: "efectivo", monto: r.precio }, AHORA);
    const d = bajaFijo(e, f.id, AHORA, auth);
    assert.equal(d.ok, true, d.mensaje);
    return M.reserva(e, r.id)!;
  };
  const e0 = demo();
  const recep = operadorDeLaDemo(e0, "RECEPTION")!.auth;
  const duenio = operadorDeLaDemo(e0, "OWNER")!.auth;
  const conRecepcion = conPago(recep);
  const conDuenio = conPago(duenio);
  assert.equal(conRecepcion.estado, "cancelada");
  assert.equal(conDuenio.estado, "cancelada");
  assert.equal(conDuenio.motivoCancelacion, "Baja del turno fijo");
  // Con el dueño vuelve todo; con recepción, lo que diga la regla del cliente (nunca más que con el dueño).
  const enSuspenso = (r: M.Reserva) => Boolean((r as M.Reserva & { senaEnSuspenso?: boolean }).senaEnSuspenso);
  assert.equal(enSuspenso(conRecepcion), true, "con recepción, tarde: la seña queda en suspenso");
  assert.equal(enSuspenso(conDuenio), false, "con el dueño vuelve todo");
});

// ───────────── Tanda 3C · dar de baja un fijo con previa, pausa, liberar un día (bp-DISENO §3.10) ─────────────

const fijoConTurnos = () => {
  const e = demo();
  const f = e.fijos[0];
  M.materializarFijosHasta(e, HOY, 14);
  const turnos = e.reservas.filter((r) => r.fijoId === f.id && r.estado === "reservada" && r.fecha >= HOY && M.minutosHasta(AHORA, r.fecha, r.inicio) > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { e, f, turnos };
};

test("BP-100: la previa NO cambia nada (corre sobre una copia) y cuenta turnos y plata; lo que anuncia es lo que pasa al confirmar", () => {
  const { e, f, turnos } = fijoConTurnos();
  assert.ok(turnos.length >= 2, "la demo tiene el fijo en la grilla");
  M.registrarPago(e, turnos[1].id, { medio: "efectivo", monto: 21000 }, AHORA);
  const duenio = operadorDeLaDemo(e, "OWNER")!.auth;
  const antes = JSON.stringify(e);
  const previa = previaBajaFijo(e, { tipo: "baja", fijoId: f.id, desde: HOY }, AHORA, duenio);
  assert.equal(JSON.stringify(e), antes, "la previa no tocó el club");
  assert.ok(previa.ok);
  if (!previa.ok) return;
  assert.equal(previa.turnos, turnos.length);
  assert.equal(previa.plata.credito, 21000);
  assert.match(previa.resumen, new RegExp(`^Se liberan ${turnos.length} turnos · \\$ 21\\.000 vuelven como crédito$`));
  assert.equal(previa.lineas.length, turnos.length);
  // Confirmado (el comando): lo mismo que dijo la previa.
  const d = ejecutarBajaFijo(e, { tipo: "baja", fijoId: f.id, desde: HOY }, AHORA, duenio);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.turnos!.length, previa.turnos);
  assert.ok(turnos.every((r) => M.reserva(e, r.id)!.estado === "cancelada"));
  assert.ok(!e.fijos.some((x) => x.id === f.id), "desde esta semana: sale de la lista");
  assert.match(d.mensaje, /Dado de baja el fijo de .*\$ 21\.000 vuelven como crédito/);
});

test("BP-102: «Deshacer» (la foto de antes, como hace el almacén) deja el fijo y sus turnos como estaban, con su plata", () => {
  const { e, f, turnos } = fijoConTurnos();
  M.registrarPago(e, turnos[0].id, { medio: "efectivo", monto: 10000 }, AHORA);
  const foto = JSON.stringify(M.serializarEstado(e));
  const titular = M.reserva(e, turnos[0].id)!.clienteId;
  const monedero = titular ? M.cliente(e, titular)!.monedero : 0;
  assert.equal(ejecutarBajaFijo(e, { tipo: "baja", fijoId: f.id, desde: HOY }, AHORA, operadorDeLaDemo(e, "OWNER")!.auth).ok, true);
  const h = M.hidratarEstado(JSON.parse(foto));
  assert.ok(h.ok);
  if (!h.ok) return;
  assert.ok(h.estado.fijos.some((x) => x.id === f.id), "el fijo volvió");
  for (const r of turnos) assert.equal(M.reserva(h.estado, r.id)!.estado, "reservada");
  if (titular) assert.equal(M.cliente(h.estado, titular)!.monedero, monedero, "la plata, como estaba");
  assert.equal(SE_DESHACE.bajaFijo, true);
});

test("pausa: los turnos del rango se liberan, la lista dice «Pausado hasta … · vuelve el …», y fuera de la pausa vuelven solos", () => {
  const { e, f } = fijoConTurnos();
  const hasta = M.sumarDias(HOY, 10);
  const d = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.match(d.mensaje, /^Pausado el fijo de .* hasta el \d+\/\d+; vuelve solo el \S+ \d+\/\d+\./);
  const vista = armarFijos(e, AHORA).fijos.find((x) => x.id === f.id)!;
  assert.match(vista.estado!, /^Pausado hasta el \d+\/\d+ · vuelve el \d+\/\d+$/);
  assert.ok(vista.fechas.every((x) => x.fecha > hasta), "las fechas para elegir son las que juega");
  const g = e.fijos.find((x) => x.id === f.id)!;
  assert.equal(M.fijoJuegaEl(g, d.vuelve!), true, "el día que vuelve se baja solo");
  assert.equal(M.fijoJuegaEl(g, M.sumarDias(d.vuelve!, -7)), false, "en la pausa, no");
});

test("BP-101: acortar la pausa (pausar de nuevo hasta antes): las fechas que quedan fuera vuelven a la grilla y no se venden a otro", () => {
  const { e, f } = fijoConTurnos();
  M.materializarFijosHasta(e, HOY, 14);
  const en7 = M.sumarDias(HOY, 7), en14 = M.sumarDias(HOY, 14);
  const vivos = (fecha: string) => e.reservas.filter((r) => r.fijoId === f.id && r.fecha === fecha && r.estado === "reservada").length;
  assert.equal(vivos(en7), 1);
  assert.equal(ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 20) }, AHORA).ok, true);
  assert.equal(vivos(en7), 0, "en la pausa larga, el +7 se libera");
  const d = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 1) }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.vuelve, en7);
  assert.equal(vivos(en7), 1, "el +7 vuelve a la grilla en el acto (no recién al próximo arranque)");
  assert.equal(fijosPorBajar(e, en7), 0, "no queda «por bajar»");
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(vivos(en7), 1, "el +7 sigue en la grilla");
  assert.equal(vivos(en14), 1, "el +14 también");
  assert.equal(fijosPorBajar(e, en7), 0);
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(vivos(en7), 1, "idempotente: no se duplica");
  // La baja y «liberar» siguen contando como bajadas (no reviven).
  assert.equal(ejecutarBajaFijo(e, { tipo: "liberar", fijoId: f.id, fecha: en14 }, AHORA).ok, true);
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(vivos(en14), 0, "lo liberado no vuelve");
});

test("BP-101 (cert v2-2): acortar la pausa devuelve YA a la grilla el turno de la semana a la vista; el hueco no se vende y no se duplica", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const k = 3;
  const dia = M.diaSemana(M.sumarDias(HOY, k));
  const canchaId = e.canchas.find((c) => [0, 1, 2, 3].every((i) => M.validarHueco(e, { canchaId: c.id, fecha: M.sumarDias(HOY, k + 7 * i), inicio: 22 * 60, duracion: 60 }).ok))!.id;
  const f = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Fijo Martes", desde: HOY });
  const fecha = M.sumarDias(HOY, k);
  const vivos = () => e.reservas.filter((r) => r.fijoId === f.id && r.fecha === fecha && r.estado === "reservada");
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 20) }, AHORA).ok, true);
  const copia = structuredClone(e);
  const previa = previaBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 1) }, AHORA, undefined, copia);
  assert.equal(previa.ok, true);
  assert.equal(copia.reservas.filter((r) => r.fijoId === f.id && r.fecha === fecha && r.estado === "reservada").length, 1, "la previa (sobre copia) ya lo muestra de vuelta");
  assert.equal(vivos().length, 0, "la previa no toca el estado de verdad");
  const d = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 1) }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.vuelve, fecha);
  assert.equal(vivos().length, 1, "vuelve a la grilla en el acto");
  assert.equal(vivos()[0].pagos.length, 0, "sin plata vieja");
  assert.equal(M.validarHueco(e, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion }).ok, false, "el hueco ya no está libre");
  assert.equal(M.crearReserva(e, { canchaId: f.canchaId, fecha, inicio: f.inicio, duracion: f.duracion, tipo: "turno", titular: "Otro" }, AHORA).ok, false, "un alta suelta no lo pisa");
  ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 1) }, AHORA);
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(vivos().length, 1, "reaplicar no duplica");
});

test("BP-101 (cert v3 A1): acortar la pausa con el hueco ya vendido (otro puesto / la web): no pisa, la previa y el aviso dicen que esa fecha NO vuelve, y «vuelve solo» salta a la siguiente", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const k = 3;
  const dia = M.diaSemana(M.sumarDias(HOY, k));
  const canchaId = e.canchas.find((c) => [0, 1, 2, 3].every((i) => M.validarHueco(e, { canchaId: c.id, fecha: M.sumarDias(HOY, k + 7 * i), inicio: 22 * 60, duracion: 60 }).ok))!.id;
  const f = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Fijo Martes", desde: HOY });
  const fecha = M.sumarDias(HOY, k);
  const vivos = (x: EstadoClub) => x.reservas.filter((r) => r.fijoId === f.id && r.fecha === fecha && r.estado === "reservada");
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 20) }, AHORA).ok, true);
  assert.equal(vivos(e).length, 0);
  // Mientras tanto otro puesto (o el turnero web) vende ese hueco.
  assert.equal(M.crearReserva(e, { canchaId, fecha, inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Otro" }, AHORA).ok, true);
  const copia = structuredClone(e);
  const previa = previaBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 1) }, AHORA, undefined, copia);
  assert.equal(previa.ok, true);
  if (!previa.ok) return;
  const dm = `${Number(fecha.slice(8))}/${Number(fecha.slice(5, 7))}`;
  assert.equal(previa.chocan.length, 1, "la previa trae el choque");
  assert.equal(previa.chocan[0].fecha, fecha);
  assert.ok(previa.lineas.some((l) => l.includes(dm) && /no vuelve/.test(l)), `la previa dice que el ${dm} no vuelve: ${previa.lineas.join(" | ")}`);
  assert.notEqual(previa.vuelve, fecha, "no anuncia como «vuelve solo» una fecha ocupada");
  assert.equal(previa.vuelve, M.sumarDias(fecha, 7), "salta a la semana siguiente");
  const d = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 1) }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(vivos(e).length, 0, "no pisa el turno vendido");
  assert.doesNotMatch(d.mensaje, new RegExp(`vuelve solo el \\S+ ${dm.replace("/", "\\/")}\\.`), `anuncia una fecha ocupada: «${d.mensaje}»`);
  assert.match(d.mensaje, new RegExp(`No vuelve el \\S+ ${dm.replace("/", "\\/")}: se pisa con otro turno`), d.mensaje);
  assert.equal(d.vuelve, M.sumarDias(fecha, 7));
  assert.deepEqual(d.chocan?.map((c) => c.fecha), [fecha]);
  // El WhatsApp al titular tampoco lo cita para el día ocupado.
  const wa = textoAvisoBaja(e, f, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 1) }, previa);
  assert.doesNotMatch(wa, new RegExp(`de vuelta el \\S+ ${dm.replace("/", "\\/")}`), wa);
});

test("BP-101 (cert v3 A1 fuera de la ventana): la primera fecha después de la pausa, todavía sin bajar, ya la vendió otro → «vuelve solo» salta a la libre y el choque se dice en previa, aviso y WhatsApp", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const k = 3;
  const dia = M.diaSemana(M.sumarDias(HOY, k));
  const canchaId = e.canchas.find((c) => [0, 1, 2, 3, 4].every((i) => M.validarHueco(e, { canchaId: c.id, fecha: M.sumarDias(HOY, k + 7 * i), inicio: 22 * 60, duracion: 60 }).ok))!.id;
  const f = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Fijo Martes", desde: HOY });
  M.materializarFijosHasta(e, HOY, 14);
  const ocupada = M.sumarDias(HOY, k + 21); // fuera de la ventana de 14 días: el fijo no la bajó
  assert.equal(e.reservas.some((r) => r.fijoId === f.id && r.fecha === ocupada), false);
  assert.equal(M.crearReserva(e, { canchaId, fecha: ocupada, inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Otro" }, AHORA).ok, true);
  const a = { tipo: "pausa" as const, fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, k + 14) };
  const previa = previaBajaFijo(e, a, AHORA);
  assert.equal(previa.ok, true);
  if (!previa.ok) return;
  const dm = `${Number(ocupada.slice(8))}/${Number(ocupada.slice(5, 7))}`;
  assert.equal(previa.vuelve, M.sumarDias(ocupada, 7), "salta a la semana libre");
  assert.deepEqual(previa.chocan.map((c) => c.fecha), [ocupada]);
  assert.ok(previa.lineas.some((l) => l.includes(dm) && /no vuelve/.test(l)), previa.lineas.join(" | "));
  const wa = textoAvisoBaja(e, f, a, previa);
  assert.doesNotMatch(wa, new RegExp(`de vuelta el \\S+ ${dm.replace("/", "\\/")}`), wa);
  assert.match(wa, new RegExp(`${dm.replace("/", "\\/")} no: ese horario ya está tomado`), wa);
  const d = ejecutarBajaFijo(e, a, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(d.vuelve, M.sumarDias(ocupada, 7));
  assert.match(d.mensaje, new RegExp(`No vuelve el \\S+ ${dm.replace("/", "\\/")}: se pisa con otro turno`), d.mensaje);
});

test("BP-101 (cert v3 A2): la previa de acortar la pausa cuenta los turnos que VUELVEN a la grilla", () => {
  const e = M.generarDemo(HOY, AHORA.min);
  const k = 3;
  const dia = M.diaSemana(M.sumarDias(HOY, k));
  const canchaId = e.canchas.find((c) => [0, 1, 2, 3].every((i) => M.validarHueco(e, { canchaId: c.id, fecha: M.sumarDias(HOY, k + 7 * i), inicio: 22 * 60, duracion: 60 }).ok))!.id;
  const f = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Fijo Martes", desde: HOY });
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 20) }, AHORA).ok, true);
  const p = previaBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(HOY, 1) }, AHORA);
  assert.equal(p.ok, true);
  if (!p.ok) return;
  assert.doesNotMatch(p.resumen, /No hay turnos suyos/, p.resumen);
  assert.match(p.resumen, /^Vuelven 2 turnos a la grilla$/, p.resumen);
  assert.equal(p.lineas.filter((l) => /vuelve a la grilla/.test(l)).length, 2, p.lineas.join(" | "));
});

test("BP-104: liberar UN día de dentro de 3 semanas: esa fecha no se baja y las demás sí", () => {
  const { e, f } = fijoConTurnos();
  const en3 = armarFijos(e, AHORA).fijos.find((x) => x.id === f.id)!.fechas[3].fecha;
  const d = ejecutarBajaFijo(e, { tipo: "liberar", fijoId: f.id, fecha: en3 }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  const g = e.fijos.find((x) => x.id === f.id)!;
  assert.equal(M.fijoJuegaEl(g, en3), false);
  assert.equal(M.fijoJuegaEl(g, M.sumarDias(en3, 7)), true);
  assert.equal(fijosPorBajar(e, en3), fijosPorBajar(e, M.sumarDias(en3, 7)) - 1, "sólo ése no se baja ese día");
  M.materializarFijosHasta(e, M.sumarDias(en3, -7), 14);
  assert.ok(!e.reservas.some((r) => r.fijoId === f.id && r.fecha === en3));
  assert.ok(e.reservas.some((r) => r.fijoId === f.id && r.fecha === M.sumarDias(en3, 7) && r.estado === "reservada"));
  assert.equal(ejecutarBajaFijo(e, { tipo: "liberar", fijoId: f.id, fecha: M.sumarDias(en3, 1) }, AHORA).ok, false, "un día que no juega, no");
});

test("dar de baja desde una fecha: hasta ese día sigue, la lista dice «Juega hasta el …»; el WhatsApp cuenta la plata", () => {
  const { e, f, turnos } = fijoConTurnos();
  const desde = turnos[1].fecha;
  const previa = previaBajaFijo(e, { tipo: "baja", fijoId: f.id, desde }, AHORA);
  assert.ok(previa.ok);
  if (!previa.ok) return;
  const d = ejecutarBajaFijo(e, { tipo: "baja", fijoId: f.id, desde }, AHORA);
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(M.reserva(e, turnos[0].id)!.estado, "reservada");
  assert.match(armarFijos(e, AHORA).fijos.find((x) => x.id === f.id)!.estado!, /^Juega hasta el /);
  const texto = textoAvisoBaja(e, f, { tipo: "baja", fijoId: f.id, desde }, previa);
  assert.match(texto, /^¡Hola \S+! Dimos de baja tu turno fijo de los \S+ a las \d\d:\d\d desde el \S+ \d+\/\d+\./);
});

test("la baja vieja («fijo» → «baja», en alguna cola) es la de desde hoy; sobre un fijo que ya no está, no toca nada", () => {
  const { e, f } = fijoConTurnos();
  assert.equal(bajaFijo(e, f.id, AHORA).ok, true);
  const antes = JSON.stringify(e);
  assert.equal(ejecutarBajaFijo(e, { tipo: "baja", fijoId: f.id, desde: HOY }, AHORA).ok, false);
  assert.equal(JSON.stringify(e), antes);
});

// ── cert v4, Falla 1: un fijo de otro todavía sin bajar también ocupa el hueco ──
const k = 3;
function baseV4(semanas = 12) {
  const e = M.generarDemo(HOY, AHORA.min) as EstadoClub;
  const dia = M.diaSemana(M.sumarDias(HOY, k));
  const canchaId = e.canchas.find((c) => Array.from({ length: semanas }, (_, i) => i).every((i) => M.validarHueco(e, { canchaId: c.id, fecha: M.sumarDias(HOY, k + 7 * i), inicio: 22 * 60, duracion: 60 }).ok))!.id;
  const f = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Juan Fijo", desde: HOY });
  M.materializarFijosHasta(e, HOY, 14);
  return { e, f, canchaId, dia };
}
const dV4 = (i: number) => M.sumarDias(HOY, k + 7 * i);

test("BP-101 (cert v4) 1 otro fijo todavía sin bajar ocupa la primera fecha de la vuelta: «vuelve solo» no puede anunciarla", () => {
  const { e, f, canchaId, dia } = baseV4();
  assert.equal(ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(10) }, AHORA).ok, true);
  // Durante la pausa, el mostrador da un fijo nuevo a Pedro en ese hueco desde dV4(4) (fuera de la ventana, no se bajó).
  const B = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Pedro Nuevo", desde: dV4(4) });
  // Pedro juega hasta dV4(5): choque acotado, Juan tiene a qué volver (si Pedro es permanente la pausa no se acorta:
  // dictamen v5, Falla 1, ver «v5-2»).
  B.hasta = dV4(5);
  // Se acorta la pausa de Juan hasta antes de dV4(4).
  const a = { tipo: "pausa" as const, fijoId: f.id, desde: HOY, hasta: M.sumarDias(dV4(4), -1) };
  // Precondición (se mira ANTES de ejecutar: la ejecución le libera esa fecha a Juan).
  assert.equal(M.fijoJuegaEl(B, dV4(4)) && f.dia === M.diaSemana(dV4(4)) && a.hasta < dV4(4), true);
  const previa = previaBajaFijo(e, a, AHORA);
  assert.equal(previa.ok, true);
  if (!previa.ok) return;
  const r = ejecutarBajaFijo(e, a, AHORA);
  // A Juan se le libera esa fecha (no se la gana al bajar) y el choque se dice con el nombre del otro fijo.
  assert.equal(M.fijoJuegaEl(f, dV4(4)), false);
  assert.match(r.mensaje, /se pisan? con el fijo de Pedro Nuevo/);
  assert.ok(previa.lineas.some((l) => /no vuelve: se pisa con el fijo de Pedro Nuevo/.test(l)));
  assert.ok(r.vuelve !== dV4(4) || (r.chocan ?? []).some((c) => c.fecha === dV4(4)), `anuncia «${r.mensaje}» y dV4(4) es del fijo de Pedro`);
});

test("BP-101 (cert v4) 1b … al bajar la ventana (orden real de la lista), el fijo de Pedro pierde su primera fecha sin que nadie se lo haya dicho", () => {
  const { e, f, canchaId, dia } = baseV4();
  ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(10) }, AHORA);
  const B = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Pedro Nuevo", desde: dV4(4) });
  const r = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(dV4(4), -1) }, AHORA);
  const conflictos = M.materializarFijosHasta(e, dV4(2), 14);
  const pedro = e.reservas.some((x) => x.fijoId === B.id && x.fecha === dV4(4) && x.estado === "reservada");
  assert.equal(pedro, true, `Pedro pierde el ${dV4(4)} (vuelve=${r.vuelve}; conflictos al bajar: ${conflictos.map((c: any) => c.fijo.titular + " " + c.fecha).join(", ")})`);
});

test("BP-101 (cert v4) 2 fecha liberada por el titular: se salta sin choque", () => {
  const { e, f } = baseV4();
  ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(6) }, AHORA);
  f.excepciones.push(dV4(3));
  const r = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(2) }, AHORA);
  assert.equal(r.vuelve, dV4(4));
  assert.deepEqual(r.chocan, []);
});

test("BP-101 (cert v4) 3 más de 8 fechas ocupadas: no anuncia vuelta falsa", () => {
  const { e, f, canchaId } = baseV4(14);
  for (let i = 3; i < 13; i++) assert.equal(M.crearReserva(e, { canchaId, fecha: dV4(i), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Otro" }, AHORA).ok, true);
  const a = { tipo: "pausa" as const, fijoId: f.id, desde: HOY, hasta: dV4(2) };
  const p = previaBajaFijo(e, a, AHORA);
  assert.equal(p.ok && p.vuelve, null);
  const r = ejecutarBajaFijo(e, a, AHORA);
  assert.equal(r.vuelve, null);
  assert.doesNotMatch(r.mensaje, /vuelve solo/);
  assert.equal(r.chocan?.length, 8);
  const v = armarFijos(e, AHORA).fijos.find((x) => x.id === f.id)!;
  assert.doesNotMatch(v.estado ?? "", /vuelve el/);
});

test("BP-101 (cert v4) 4 deshacer (restaurar la foto) después de acortar: estado y vuelta coherentes", () => {
  const { e, f } = baseV4();
  ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(5) }, AHORA);
  const foto = structuredClone(e);
  const antes = armarFijos(e, AHORA).fijos.find((x) => x.id === f.id)!.estado;
  ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(1) }, AHORA);
  const back = structuredClone(foto);
  assert.equal(armarFijos(back, AHORA).fijos.find((x) => x.id === f.id)!.estado, antes);
  const g = back.fijos.find((x) => x.id === f.id)!;
  assert.equal(vueltaDelFijo(back, g, M.sumarDias(dV4(5), 1)).vuelve, dV4(6));
});

test("BP-101 (cert v4) 5 réplica: el mismo comando dos veces no duplica turnos y dice lo mismo", () => {
  const { e, f, canchaId } = baseV4();
  ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(5) }, AHORA);
  M.crearReserva(e, { canchaId, fecha: dV4(1), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Otro" }, AHORA);
  const a = { tipo: "pausa" as const, fijoId: f.id, desde: HOY, hasta: dV4(0) };
  const r1 = ejecutarBajaFijo(e, a, AHORA);
  const n = e.reservas.filter((x) => x.fijoId === f.id && x.estado === "reservada").length;
  const r2 = ejecutarBajaFijo(e, a, AHORA);
  assert.equal(e.reservas.filter((x) => x.fijoId === f.id && x.estado === "reservada").length, n);
  assert.equal(r1.vuelve, r2.vuelve);
  assert.deepEqual(r1.chocan?.map((c) => c.fecha), r2.chocan?.map((c) => c.fecha));
  assert.equal(r1.vuelve, dV4(2));
});

test("BP-101 (cert v4) 6 dos puestos: la previa del puesto 1 se hizo antes de que el puesto 2 venda; el comando (servidor) no anuncia la vendida", () => {
  const { e, f, canchaId } = baseV4();
  ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(8) }, AHORA);
  const a = { tipo: "pausa" as const, fijoId: f.id, desde: HOY, hasta: dV4(3) };
  const previa = previaBajaFijo(e, a, AHORA);
  assert.equal(previa.ok && previa.vuelve, dV4(4));
  const servidor = structuredClone(e);
  assert.equal(M.crearReserva(servidor, { canchaId, fecha: dV4(4), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Web" }, AHORA).ok, true);
  const r = ejecutarBajaFijo(servidor, a, AHORA);
  assert.equal(r.vuelve, dV4(5));
  assert.deepEqual(r.chocan?.map((c) => c.fecha), [dV4(4)]);
});

test("BP-101 (cert v4) nuevoFijo no deja pisar a otro fijo en pausa que vuelve más adelante; con el otro dado de baja, sí", () => {
  const { e, f, canchaId, dia } = baseV4();
  ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: dV4(10) }, AHORA);
  const datos = { titular: "Pedro Nuevo", clienteId: null, canchaId, dia, inicio: 22 * 60 + 30, duracion: 60 };
  const r = nuevoFijo(e, datos, AHORA);
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /ya es del fijo de Juan Fijo .*lo juega el/);
  assert.ok(!e.fijos.some((x) => x.titular === "Pedro Nuevo"));
  // Si Juan se da de baja del todo, el hueco queda libre para un fijo nuevo.
  assert.equal(ejecutarBajaFijo(e, { tipo: "baja", fijoId: f.id, desde: HOY }, AHORA).ok, true);
  assert.equal(nuevoFijo(e, datos, AHORA).ok, true);
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

  test("v5-1 deshacer (foto) tras liberar la fecha de Juan: vuelve todo como estaba", () => {
    const { e, f, acortar } = conPedro();
    const foto = structuredClone(e);
    const r = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r.ok, true);
    assert.ok(f.excepciones.includes(d(4)));
    const back = structuredClone(foto);
    assert.equal(JSON.stringify(back), JSON.stringify(foto));
    const g = back.fijos.find((x) => x.id === f.id)!;
    assert.equal(g.excepciones.includes(d(4)), false);
    assert.equal(g.pausa?.hasta, d(10));
  });

  test("v5-2 réplica (Falla 1): Pedro permanente → la pausa no se acorta ni libera nada, por más que se repita", () => {
    const { e, f, P, acortar } = conPedro(d(4), {});
    const antes = JSON.stringify(e);
    const r1 = ejecutarBajaFijo(e, acortar, AHORA);
    const r2 = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r1.ok, false);
    assert.match(r1.mensaje, /El hueco es del fijo de Pedro Nuevo desde el .*: Juan Fijo no tiene a qué volver\. Elegí otra hora o dalo de baja\./);
    assert.equal(r2.mensaje, r1.mensaje);
    assert.equal(JSON.stringify(e), antes);
    assert.equal(f.excepciones.length, 0);
    assert.equal(f.pausa?.hasta, d(10));
    M.materializarFijosHasta(e, d(2), 14);
    assert.ok(e.reservas.some((x) => x.fijoId === P.id && x.fecha === d(4) && x.estado === "reservada"));
    // La previa dice lo mismo y tampoco toca nada.
    const p = previaBajaFijo(e, acortar, AHORA);
    assert.equal(p.ok, false);
  });

  test("v5-2b réplica con choque acotado: el mismo comando dos veces deja el mismo estado y dice lo mismo", () => {
    const { e, f, P, acortar } = conPedro();
    const r1 = ejecutarBajaFijo(e, acortar, AHORA);
    const foto = JSON.stringify(e);
    const r2 = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r1.ok, true);
    assert.equal(r1.vuelve, d(6));
    assert.deepEqual(f.excepciones.sort(), [d(4), d(5)].sort());
    assert.equal(JSON.stringify({ ...JSON.parse(JSON.stringify(e)), log: null }), JSON.stringify({ ...JSON.parse(foto), log: null }));
    assert.equal(r1.vuelve, r2.vuelve);
    assert.deepEqual(r1.chocan?.map((c) => c.fecha), r2.chocan?.map((c) => c.fecha), `r1=«${r1.mensaje}» r2=«${r2.mensaje}»`);
    M.materializarFijosHasta(e, d(2), 14);
    assert.ok(e.reservas.some((x) => x.fijoId === P.id && x.fecha === d(4) && x.estado === "reservada"));
  });

  test("v5-3 el otro fijo pausado en esa fecha no se la quita a Juan", () => {
    const { e, f, P, acortar } = conPedro(d(4), { pausa: { desde: d(4), hasta: d(4) } } as Partial<Fijo>);
    const r = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r.vuelve, d(4));
    assert.equal(f.excepciones.includes(d(4)), false);
    assert.equal(M.fijoJuegaEl(P, d(4)), false);
  });

  test("v5-4 vigencia: Pedro hasta antes o desde después de la fecha: no choca", () => {
    const a = conPedro(d(1), { hasta: d(3) } as Partial<Fijo>);
    assert.equal(ejecutarBajaFijo(a.e, a.acortar, AHORA).vuelve, d(4));
    const b = conPedro(d(5));
    assert.equal(ejecutarBajaFijo(b.e, b.acortar, AHORA).vuelve, d(4));
  });

  test("v5-5 horario parcial (22:30) choca; otra cancha no", () => {
    const a = conPedro(d(4), { inicio: 22 * 60 + 30, hasta: d(5) } as Partial<Fijo>);
    const ra = ejecutarBajaFijo(a.e, a.acortar, AHORA);
    assert.ok(ra.chocan?.some((c) => c.fecha === d(4) && c.fijoId === a.P.id));
    const otra = a.e.canchas.find((c) => c.id !== a.canchaId)!.id;
    const b = conPedro(d(4), { canchaId: otra } as Partial<Fijo>);
    assert.equal(ejecutarBajaFijo(b.e, b.acortar, AHORA).vuelve, d(4));
  });

  test("v5-6 previa sobre copia: no libera nada en el estado real", () => {
    const { e, f, acortar } = conPedro();
    const antes = JSON.stringify(e);
    const p = previaBajaFijo(e, acortar, AHORA);
    assert.equal(p.ok, true);
    assert.equal(JSON.stringify(e), antes);
    assert.equal(f.excepciones.includes(d(4)), false);
  });

  test("v5-7 dos puestos: baja de Pedro y acortar de Juan en cualquier orden: la fecha queda para Juan, nunca para dos", () => {
    for (const orden of ["pedroPrimero", "juanPrimero"]) {
      const { e, f, P, acortar } = conPedro();
      if (orden === "pedroPrimero") ejecutarBajaFijo(e, { tipo: "baja", fijoId: P.id, desde: HOY }, AHORA);
      ejecutarBajaFijo(e, acortar, AHORA);
      if (orden === "juanPrimero") {
        const r = ejecutarBajaFijo(e, { tipo: "baja", fijoId: P.id, desde: HOY }, AHORA);
        assert.match(r.mensaje, /Juan Fijo recuperan el .*, el /);
        assert.deepEqual(f.liberadasPor ?? [], []);
      }
      M.materializarFijosHasta(e, d(2), 14);
      const vivos = e.reservas.filter((x) => x.fecha === d(4) && x.estado === "reservada" && x.inicio === 22 * 60 && x.canchaId === f.canchaId);
      assert.equal(vivos.length, 1, orden);
      assert.equal(vivos[0].fijoId, f.id, orden);
      assert.equal(f.excepciones.includes(d(4)), false, orden);
    }
  });

  test("v5-11 nunca quedan dos fijos permanentes en el hueco: Juan vuelve y juega solo", () => {
    const { e, f, canchaId } = base();
    ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: d(1) }, AHORA);
    reservar(e, { canchaId, fecha: d(0), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Pedro Alta", clienteId: null, otros: "", fijo: true }, AHORA);
    assert.equal(e.fijos.some((x) => x.titular === "Pedro Alta"), false);
    ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: d(0) }, AHORA);
    assert.deepEqual(solapes(e, f), []);
    // Y por la puerta de siempre (nuevoFijo) el mismo mensaje.
    const n = nuevoFijo(e, { titular: "Pedro Nuevo", clienteId: null, canchaId, dia: f.dia, inicio: 22 * 60, duracion: 60 }, AHORA);
    assert.equal(n.ok, false);
    assert.match(n.mensaje, /^Ese horario ya es del fijo de Juan Fijo \(martes 22:00/);
  });

  test("v5-12 nuevoFijo: tras la baja con fecha de Juan (vigencia hasta), se puede crear a partir de entonces", () => {
    const { e, f, canchaId, dia } = base();
    ejecutarBajaFijo(e, { tipo: "baja", fijoId: f.id, desde: d(0) }, AHORA);
    assert.ok(!e.fijos.includes(f) || (f.hasta! < d(0)));
    const r = nuevoFijo(e, { titular: "Pedro Nuevo", clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60 }, AHORA);
    assert.equal(r.ok, true, r.mensaje);
  });
}
