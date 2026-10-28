// Mantenimiento, bloqueos, turnos fijos y lista de espera contra el motor REAL sobre la demo.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import type { Fijo } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { DIAS_A_LA_VISTA, SE_DESHACE, type AccionBajaFijo, bajaFijo, armarCanchas, armarEspera, armarFijos, bajarFijos, ejecutarBajaFijo, ejecutarCanchas, ejecutarEspera, fijosPorBajar, horasDelDia, nuevoFijo, otroFijoQuePisa, otroFijoQueSigue, previaBajaFijo, textoAvisoBaja, textoAvisoRecupera, vueltaDelFijo } from "./canchas-core";
import { armarAgenda } from "./agenda-core";
import { ejecutarCiclo } from "./ciclo-core";
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

test("BP-101 (cert v4) 3 más de 8 fechas ocupadas: no anuncia vuelta falsa (v7: anuncia la verdadera, la primera libre)", () => {
  const { e, f, canchaId } = baseV4(14);
  for (let i = 3; i < 13; i++) assert.equal(M.crearReserva(e, { canchaId, fecha: dV4(i), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Otro" }, AHORA).ok, true);
  const a = { tipo: "pausa" as const, fijoId: f.id, desde: HOY, hasta: dV4(2) };
  const p = previaBajaFijo(e, a, AHORA);
  // Dictamen v6, observación 2: la vuelta se busca tan lejos como el guardián (80 semanas), no en 8 fechas.
  assert.equal(p.ok && p.vuelve, dV4(13));
  const r = ejecutarBajaFijo(e, a, AHORA);
  assert.equal(r.vuelve, dV4(13));
  assert.ok(M.validarHueco(e, { canchaId, fecha: dV4(13), inicio: 22 * 60, duracion: 60 }).ok || e.reservas.some((x) => x.fijoId === f.id && x.fecha === dV4(13)), "la vuelta anunciada está libre");
  assert.equal(r.chocan?.length, 10);
  assert.match(r.mensaje, /No vuelven 10 fechas, del .* al .*: se pisan con otros turnos\./);
  const v = armarFijos(e, AHORA).fijos.find((x) => x.id === f.id)!;
  assert.match(v.estado ?? "", /vuelve el/);
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
    // v7 (observación 2): lo que se ofrece se puede hacer desde esta misma hoja.
    assert.match(r1.mensaje, /El hueco es del fijo de Pedro Nuevo desde el .*: Juan Fijo no tiene a qué volver\. Dalo de baja o liberá sólo las fechas que no viene\./);
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
    // v7: Pedro juega sólo d(4) (si siguiera después, la pausa se rechaza por la observación 1: ver «v7-1»).
    const { e, f, P, acortar } = conPedro(d(4), { hasta: d(4), pausa: { desde: d(4), hasta: d(4) } } as Partial<Fijo>);
    const r = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r.vuelve, d(4));
    assert.equal(f.excepciones.includes(d(4)), false);
    assert.equal(M.fijoJuegaEl(P, d(4)), false);
  });

  test("v5-4 vigencia: Pedro hasta antes o desde después de la fecha: no choca", () => {
    const a = conPedro(d(1), { hasta: d(3) } as Partial<Fijo>);
    assert.equal(ejecutarBajaFijo(a.e, a.acortar, AHORA).vuelve, d(4));
    const b = conPedro(d(5));
    // La vigencia se respeta (con la pausa acortada, Juan vuelve el d(4))…
    const corto = { ...structuredClone(b.f), pausa: { desde: HOY, hasta: b.acortar.hasta } };
    assert.equal(vueltaDelFijo(b.e, corto, d(4)).vuelve, d(4));
    // …pero el d(5) jugarían los dos: v7 (observación 1) lo dice y no cambia nada.
    const antes = JSON.stringify(b.e);
    const rb = ejecutarBajaFijo(b.e, b.acortar, AHORA);
    assert.equal(rb.ok, false);
    assert.match(rb.mensaje, /se pisarían/);
    assert.equal(JSON.stringify(b.e), antes);
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
        // v7 (observación 3): el plural va por titular, no por fecha.
        assert.match(r.mensaje, /Juan Fijo recupera el .* y el /);
        assert.doesNotMatch(r.mensaje, /recuperan/);
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

  // ── Dictamen v6: observaciones 1–5 (respuesta del ingeniero v7) ──

  test("v7-1 (obs. 1, v6-3) Pedro permanente que liberó UNA fecha: la pausa no se acepta con «vuelve» y no cambia nada", () => {
    const { e, f, P, acortar } = conPedro(d(4), {});
    P.excepciones.push(d(6));
    const antes = JSON.stringify(e);
    const p = previaBajaFijo(e, acortar, AHORA);
    assert.equal(p.ok, false);
    const r1 = ejecutarBajaFijo(e, acortar, AHORA);
    const r2 = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r1.ok, false);
    assert.match(r1.mensaje, /^Juan Fijo volvería el .*, pero el .* el hueco sigue siendo del fijo de Pedro Nuevo \(martes 22:00\): se pisarían\. Dalo de baja o liberá sólo las fechas que no viene\.$/);
    assert.equal(r2.mensaje, r1.mensaje);
    assert.equal(JSON.stringify(e), antes);
    assert.equal(f.pausa?.hasta, d(10));
    // El barrido nombra la primera fecha en que los dos jugarían después de la vuelta.
    const prueba = structuredClone(e);
    prueba.fijos.find((x) => x.id === f.id)!.pausa = { desde: HOY, hasta: acortar.hasta };
    assert.equal(otroFijoQueSigue(prueba, prueba.fijos.find((x) => x.id === f.id)!, d(6))?.fecha, d(7));
  });

  test("v7-2 (obs. 2, v6-4) Pedro acotado pero largo (11 fechas): se acepta y dice la vuelta real", () => {
    const { e, f, P, acortar } = conPedro(d(4), { hasta: d(14) } as Partial<Fijo>);
    const p = previaBajaFijo(e, acortar, AHORA);
    assert.equal(p.ok && p.vuelve, d(15));
    const r = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.equal(r.vuelve, d(15));
    assert.doesNotMatch(r.mensaje, /no tiene a qué volver/);
    assert.match(r.mensaje, /vuelve solo el .*\. No vuelven 11 fechas, del .* al .*: se pisan con el fijo de Pedro Nuevo/);
    assert.equal(f.liberadasPor?.length, 11);
    assert.ok(p.ok && /Las 11 fechas, del .* no: ese horario ya está tomado/.test(textoAvisoBaja(e, f, acortar, p)));
    // Nunca dos en el hueco: ningún día lo juegan los dos y la grilla tiene uno solo por fecha.
    assert.deepEqual(solapes(e, f), []);
    M.materializarFijosHasta(e, d(4), 7);
    for (const i of [4, 5]) assert.equal(e.reservas.filter((x) => x.fecha === d(i) && x.estado === "reservada" && x.canchaId === f.canchaId && x.inicio === 22 * 60).map((x) => x.fijoId).join(), P.id);
  });

  test("v7-3 (obs. 3, v6-5) el plural va por titular y a cada uno que recupera se le arma su WhatsApp", () => {
    const { e, f, P, canchaId, acortar } = conPedro();
    ejecutarBajaFijo(e, acortar, AHORA);
    // Otro fijo (Ana, otra cancha) al que también se le había liberado una fecha por Pedro: estado armado a mano.
    const otra = e.canchas.find((c) => c.id !== canchaId)!.id;
    const A = M.crearFijo(e, { clienteId: null, canchaId: otra, dia: f.dia, inicio: 20 * 60, duracion: 60, titular: "Ana Fija", desde: HOY });
    A.excepciones.push(d(6));
    A.liberadasPor = [{ fecha: d(6), fijoId: P.id }];
    const a = { tipo: "baja" as const, fijoId: P.id, desde: HOY };
    const p = previaBajaFijo(e, a, AHORA);
    assert.ok(p.ok);
    if (!p.ok) return;
    assert.deepEqual(p.recuperan.map((x) => [x.titular, x.fechas.length, x.celular]), [["Juan Fijo", 2, ""], ["Ana Fija", 1, ""]]);
    assert.ok(p.lineas.some((l) => /la recupera Juan Fijo/.test(l)) && p.lineas.some((l) => /20:00 · la recupera Ana Fija/.test(l)));
    const r = ejecutarBajaFijo(e, a, AHORA);
    assert.match(r.mensaje, /Juan Fijo recupera el .* y el .*; Ana Fija recupera el [^,;]*\.$/);
    assert.doesNotMatch(r.mensaje, /recuperan/);
    assert.match(textoAvisoRecupera(e, p.recuperan[0]), /^¡Hola Juan! Se liberó el horario y volvés a tener tu turno fijo de los martes a las 22:00 el mar .* y el mar .*\. ¡Te esperamos!/);
    assert.equal(M.fijoJuegaEl(A, d(6)), true);
  });

  test("v7-4 (obs. 4, v6-7) si Pedro sólo se pausa o libera la fecha, Juan la recupera; nunca dos en el hueco", () => {
    const { e, f, P, acortar } = conPedro();
    ejecutarBajaFijo(e, acortar, AHORA);
    assert.deepEqual([f.excepciones.includes(d(4)), f.excepciones.includes(d(5))], [true, true]);
    // Pausa de Pedro que cubre d(4): Juan recupera d(4) (y sólo esa).
    const pausa = { tipo: "pausa" as const, fijoId: P.id, desde: HOY, hasta: d(4) };
    const antes = JSON.stringify(e);
    const p = previaBajaFijo(e, pausa, AHORA);
    assert.equal(JSON.stringify(e), antes, "la previa no toca nada");
    assert.ok(p.ok && p.recuperan.length === 1 && p.recuperan[0].fechas.join() === d(4));
    const r = ejecutarBajaFijo(e, pausa, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.match(r.mensaje, /Juan Fijo recupera el [^,;]*\.$/);
    assert.deepEqual([M.fijoJuegaEl(f, d(4)), M.fijoJuegaEl(f, d(5))], [true, false]);
    assert.deepEqual(f.liberadasPor?.map((x) => x.fecha), [d(5)]);
    // Pedro acorta su pausa: d(4) ya es de Juan → a Pedro se le libera (choque acotado) y vuelve el d(5); no se pisan.
    const r2 = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: P.id, desde: HOY, hasta: d(3) }, AHORA);
    assert.equal(r2.ok, true, r2.mensaje);
    assert.equal(r2.vuelve, d(5));
    assert.deepEqual(P.liberadasPor, [{ fecha: d(4), fijoId: f.id }]);
    assert.deepEqual(solapes(e, f), []);
    // Liberar la fecha d(5) de Pedro: Juan la recupera.
    const lib = ejecutarBajaFijo(e, { tipo: "liberar", fijoId: P.id, fecha: d(5) }, AHORA);
    assert.match(lib.mensaje, /Juan Fijo recupera el /);
    assert.equal(M.fijoJuegaEl(f, d(5)), true);
    assert.equal(f.liberadasPor, undefined);
    // Repetir no devuelve dos veces ni cambia nada.
    const foto = JSON.stringify(e);
    assert.equal(ejecutarBajaFijo(e, { tipo: "liberar", fijoId: P.id, fecha: d(5) }, AHORA).ok, false);
    assert.equal(JSON.stringify(e), foto);
    assert.deepEqual(solapes(e, f), []);
    M.materializarFijosHasta(e, d(4), 7);
    for (const i of [4, 5]) {
      const vivos = e.reservas.filter((x) => x.fecha === d(i) && x.estado === "reservada" && x.canchaId === f.canchaId && x.inicio === 22 * 60);
      assert.equal(vivos.map((x) => x.fijoId).join(), f.id, `d(${i})`);
    }
  });

  test("v7-5 (obs. 5) `liberadasPor` se poda: lo pasado sale al confirmar algo; lo rechazado no toca nada", () => {
    const { e, f, acortar } = conPedro();
    ejecutarBajaFijo(e, acortar, AHORA);
    assert.deepEqual(f.liberadasPor?.map((x) => x.fecha), [d(4), d(5)]);
    const despues = (x: string): Ahora => ({ fecha: M.sumarDias(x, 1), min: 0 });
    // Rechazado (un día que ya pasó): no se poda.
    assert.equal(ejecutarBajaFijo(e, { tipo: "liberar", fijoId: f.id, fecha: d(4) }, despues(d(4))).ok, false);
    assert.equal(f.liberadasPor?.length, 2);
    // Confirmado, pasado el d(4): queda sólo el d(5).
    assert.equal(ejecutarBajaFijo(e, { tipo: "liberar", fijoId: f.id, fecha: d(8) }, despues(d(4))).ok, true);
    assert.deepEqual(f.liberadasPor?.map((x) => x.fecha), [d(5)]);
    // Pasado el d(5): el campo desaparece; otra vez no cambia la foto.
    assert.equal(ejecutarBajaFijo(e, { tipo: "liberar", fijoId: f.id, fecha: d(9) }, despues(d(5))).ok, true);
    assert.equal("liberadasPor" in f, false);
  });

  // ── Dictamen v7: la devolución asigna cada fecha a UN solo fijo y sólo si el hueco quedó libre (respuesta v8) ──

  /** TODOS los pares de fijos de la misma cancha que se pisan en hora y juegan la misma fecha (desde `desde`, 86 semanas). */
  function dobles(e: EstadoClub, desde = HOY): string[] {
    const out: string[] = [];
    for (let i = 0; i < e.fijos.length; i++)
      for (let j = i + 1; j < e.fijos.length; j++) {
        const a = e.fijos[i], b = e.fijos[j];
        if (a.canchaId !== b.canchaId || a.dia !== b.dia || !(a.inicio < b.inicio + b.duracion && b.inicio < a.inicio + a.duracion)) continue;
        let fecha = desde;
        while (M.diaSemana(fecha) !== a.dia) fecha = M.sumarDias(fecha, 1);
        for (let n = 0; n < 86; n++, fecha = M.sumarDias(fecha, 7)) if (M.fijoJuegaEl(a, fecha) && M.fijoJuegaEl(b, fecha)) out.push(`${fecha}:${a.titular}+${b.titular}`);
      }
    return out;
  }
  const vivosEn = (e: EstadoClub, canchaId: string, fecha: string) => e.reservas.filter((x) => x.canchaId === canchaId && x.fecha === fecha && x.estado === "reservada");

  test("v8-1 (cert v7 A11) Ana se va y Juan y Pedro tenían liberadas las mismas fechas por ella: las recupera sólo el más antiguo (Juan)", () => {
    const { e, f, P, canchaId, dia } = conPedro(d(4), { hasta: d(9) } as Partial<Fijo>);
    const A = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Ana Fija", desde: d(2) });
    A.hasta = d(8);
    for (const a of [
      { tipo: "pausa", fijoId: P.id, desde: HOY, hasta: d(0) }, // Pedro vuelve el d(9); d(4)…d(8) se le liberan por Ana
      { tipo: "pausa", fijoId: A.id, desde: HOY, hasta: d(0) }, // Ana vuelve el d(2)
      { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: d(5) }, // Juan vuelve; d(6)…d(8) por Ana, d(9) por Pedro
    ] as AccionBajaFijo[])
      assert.equal(ejecutarBajaFijo(e, a, AHORA).ok, true);
    assert.deepEqual(dobles(e), []);
    const baja = { tipo: "baja" as const, fijoId: A.id, desde: d(4) };
    const p = previaBajaFijo(e, baja, AHORA);
    assert.ok(p.ok);
    if (!p.ok) return;
    const r = ejecutarBajaFijo(e, baja, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.deepEqual(dobles(e), [], r.mensaje);
    // Pedro recupera d(4) y d(5) (Juan está en pausa); d(6)…d(8) los recupera Juan (el más antiguo), una sola vez.
    assert.deepEqual(p.recuperan.map((x) => [x.titular, x.fechas]), [["Pedro Nuevo", [d(4), d(5)]], ["Juan Fijo", [d(6), d(7), d(8)]]]);
    assert.deepEqual(r.recuperan?.map((x) => x.fecha + x.titular), p.recuperan.flatMap((x) => x.fechas.map((y) => y + x.titular)).sort());
    assert.match(r.mensaje, /Pedro Nuevo recupera el .* y el [^;]*; Juan Fijo recupera el /);
    // A Pedro esas fechas le siguen liberadas, ahora esperando a Juan (el que la ocupa).
    assert.deepEqual(P.liberadasPor, [6, 7, 8].map((i) => ({ fecha: d(i), fijoId: f.id })));
    // Si Juan se va, Pedro las recupera; tampoco quedan dos.
    const rj = ejecutarBajaFijo(e, { tipo: "baja", fijoId: f.id, desde: d(6) }, AHORA);
    assert.equal(rj.ok, true, rj.mensaje);
    assert.deepEqual(rj.recuperan?.map((x) => x.titular + x.fecha), [6, 7, 8].map((i) => "Pedro Nuevo" + d(i)));
    assert.deepEqual(dobles(e), []);
    assert.equal(P.liberadasPor, undefined);
  });

  test("v8-2 (cert v7 A10) Juan tenía liberada una fecha por Pedro, pero Ana (22:30) también la juega: no la recupera ni se le avisa; vuelve cuando Ana se va", () => {
    const { e, f, P, canchaId, dia, acortar } = conPedro(d(4), { inicio: 21 * 60 + 30, hasta: d(5) } as Partial<Fijo>);
    const A = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60 + 30, duracion: 60, titular: "Ana Fija", desde: d(4) });
    A.hasta = d(5);
    assert.equal(ejecutarBajaFijo(e, acortar, AHORA).ok, true);
    assert.deepEqual(dobles(e), []);
    const baja = { tipo: "baja" as const, fijoId: P.id, desde: HOY };
    const p = previaBajaFijo(e, baja, AHORA);
    assert.ok(p.ok && p.recuperan.length === 0, JSON.stringify(p.ok && p.recuperan));
    const r = ejecutarBajaFijo(e, baja, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.doesNotMatch(r.mensaje, /recupera/);
    assert.deepEqual(dobles(e), []);
    assert.deepEqual(f.liberadasPor, [{ fecha: d(4), fijoId: A.id }, { fecha: d(5), fijoId: A.id }]);
    // Ana libera el d(5): Juan lo recupera (y se le avisa); el d(4) sigue esperando a Ana.
    const lib = ejecutarBajaFijo(e, { tipo: "liberar", fijoId: A.id, fecha: d(5) }, AHORA);
    assert.match(lib.mensaje, /Juan Fijo recupera el [^,;]*\.$/);
    assert.deepEqual([M.fijoJuegaEl(f, d(4)), M.fijoJuegaEl(f, d(5))], [false, true]);
    assert.deepEqual(dobles(e), []);
  });

  test("v8-3 (cert v7 A9b, Falla 2) el mostrador ya vendió el hueco: no se le anuncia a Juan ni juega esa fecha; la que está libre, sí", () => {
    const { e, f, P, canchaId, acortar } = conPedro();
    assert.equal(ejecutarBajaFijo(e, acortar, AHORA).ok, true);
    const luego: Ahora = { fecha: M.sumarDias(d(4), -3), min: 12 * 60 };
    M.materializarFijosHasta(e, luego.fecha, 14);
    const rp = e.reservas.find((x) => x.fijoId === P.id && x.fecha === d(4) && x.estado === "reservada")!;
    assert.equal(M.cancelar(e, rp.id, {}, luego).ok, true);
    assert.equal(M.crearReserva(e, { canchaId, fecha: d(4), inicio: 22 * 60, duracion: 60, tipo: "turno", titular: "Walk In" }, luego).ok, true);
    const a = { tipo: "baja" as const, fijoId: P.id, desde: luego.fecha };
    const p = previaBajaFijo(e, a, luego);
    const r = ejecutarBajaFijo(e, a, luego);
    assert.equal(r.ok, true, r.mensaje);
    // Sólo el d(5) (libre) se anuncia, en la previa, en el mensaje y en el WhatsApp.
    assert.ok(p.ok && p.recuperan.length === 1 && p.recuperan[0].fechas.join() === d(5), JSON.stringify(p.ok && p.recuperan));
    assert.match(r.mensaje, /Juan Fijo recupera el [^,;]*\.$/);
    assert.ok(p.ok);
    if (!p.ok) return;
    assert.match(textoAvisoRecupera(e, p.recuperan[0]), /volvés a tener tu turno fijo de los martes a las 22:00 el mar [\d/]+\. ¡Te esperamos!/);
    assert.equal(M.fijoJuegaEl(f, d(4)), false, "el d(4) es de Walk In");
    assert.equal(M.fijoJuegaEl(f, d(5)), true);
    assert.equal(f.liberadasPor, undefined);
    // El d(5) cae fuera de la semana a la vista: se baja con la ventana y es de Juan, solo.
    M.materializarFijosHasta(e, luego.fecha, 14);
    assert.deepEqual(vivosEn(e, canchaId, d(4)).map((x) => x.titular), ["Walk In"]);
    assert.deepEqual(vivosEn(e, canchaId, d(5)).map((x) => x.fijoId), [f.id]);
  });

  test("v8-4 (cert v7 A1b) 400 secuencias al azar de baja / pausa / liberar sobre tres fijos heredados (de antes del guardián), con el tiempo avanzando: 0 dobles nuevos y sólo se anuncia lo que se asigna", () => {
    let semilla = 7;
    const azar = (n: number) => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31), semilla % n);
    const nuevos: string[] = [];
    const malAnunciados: string[] = [];
    let recuperaciones = 0;
    for (let corrida = 0; corrida < 400; corrida++) {
      // Juan pausado; Pedro y Ana creados por fuera del guardián (estado heredado): los tres en el mismo hueco.
      const { e, f, P, canchaId, dia } = conPedro(d(azar(3) + 3), { hasta: d(azar(6) + 5) } as Partial<Fijo>);
      const A = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60 + 30 * azar(2), duracion: 60, titular: "Ana Fija", desde: d(azar(4) + 2) });
      A.hasta = d(azar(6) + 6);
      const fijos = [f.id, P.id, A.id];
      let ahora: Ahora = AHORA;
      for (let paso = 0; paso < 8; paso++) {
        const antes = new Set(dobles(e, ahora.fecha));
        const fijoId = fijos[azar(3)];
        const t = azar(3);
        const a: AccionBajaFijo = t === 0 ? { tipo: "pausa", fijoId, desde: ahora.fecha, hasta: d(azar(9)) } : t === 1 ? { tipo: "liberar", fijoId, fecha: d(azar(9)) } : { tipo: "baja", fijoId, desde: d(azar(12)) };
        if (a.tipo === "pausa" && a.hasta < a.desde) continue;
        const p = previaBajaFijo(e, a, ahora);
        const r = ejecutarBajaFijo(e, a, ahora);
        assert.equal(p.ok, r.ok, `previa y comando dicen distinto: ${JSON.stringify(a)} «${r.mensaje}»`);
        for (const x of dobles(e, ahora.fecha)) if (!antes.has(x)) nuevos.push(`corrida ${corrida} paso ${paso} ${JSON.stringify(a)} → ${x} «${r.mensaje}»`);
        // Lo que se anuncia es lo que pasa: el que recupera juega esa fecha, nadie más la ocupa y, en la semana a la
        // vista, tiene su turno en la grilla. La previa anuncia lo mismo que el comando.
        if (p.ok) assert.deepEqual(p.recuperan.flatMap((x) => x.fechas.map((y) => y + x.fijoId)).sort(), (r.recuperan ?? []).map((x) => x.fecha + x.fijoId).sort());
        for (const x of r.recuperan ?? []) {
          recuperaciones++;
          const g = e.fijos.find((y) => y.id === x.fijoId)!;
          const otro = e.fijos.find((y) => y.id !== g.id && y.canchaId === g.canchaId && y.inicio < g.inicio + g.duracion && g.inicio < y.inicio + y.duracion && M.fijoJuegaEl(y, x.fecha));
          const ajenos = vivosEn(e, g.canchaId, x.fecha).filter((y) => y.fijoId !== g.id && y.inicio < g.inicio + g.duracion && g.inicio < y.inicio + y.duracion);
          const enGrilla = vivosEn(e, g.canchaId, x.fecha).some((y) => y.fijoId === g.id);
          if (!M.fijoJuegaEl(g, x.fecha) || otro || ajenos.length || (x.fecha < M.sumarDias(ahora.fecha, DIAS_A_LA_VISTA) && !enGrilla)) malAnunciados.push(`corrida ${corrida} paso ${paso}: ${x.titular} ${x.fecha}`);
        }
        if (azar(3) === 0) ahora = { fecha: M.sumarDias(ahora.fecha, 7 * azar(3)), min: AHORA.min };
      }
    }
    assert.deepEqual(nuevos.slice(0, 5), [], `${nuevos.length} dobles nuevos`);
    assert.deepEqual(malAnunciados.slice(0, 5), [], `${malAnunciados.length} recuperaciones anunciadas que no pasan`);
    assert.ok(recuperaciones > 50, `el azar tiene que ejercitar la devolución (${recuperaciones})`);
  });

  // ── Dictamen v8: la espera mira si el esperado de verdad juega (C4), la pausa no deja dos fijos figurando (C1) y las
  // tres BAJA de la v7 (texto «volvería el X, pero el X», A3b por comando; la nota de los botones va en
  // hecho-de-la-baja.test.ts). Respuesta v9. ──

  const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const dm = (x: string) => `${Number(x.slice(8))}/${Number(x.slice(5, 7))}`;
  /** «mar 20/10», como lo dicen los mensajes. */
  const fc = (x: string) => `${DIAS_CORTOS[M.diaSemana(x)]} ${dm(x)}`;
  /** Lo que un comando repetido no puede cambiar (el registro del club sí suma una línea). */
  const fotoDeFijos = (e: EstadoClub) => JSON.stringify({ fijos: e.fijos, reservas: e.reservas });

  /**
   * Lo que FIGURA ocupando cada hueco y fecha: cada turno vivo de la grilla y cada fijo que juega esa fecha y todavía no
   * se bajó (su turno cancelado por la pausa no cuenta como bajado: vuelve al bajar la ventana). Dos que se pisan = un
   * doble visible, aunque la grilla tenga uno solo. Un fijo sin bajar contra un turno suelto o del mostrador no entra:
   * es lo cerrado en la v3 («no vuelve», y `materializarFijos` nunca lo baja encima).
   */
  function doblesQueFiguran(e: EstadoClub, desde = HOY, semanas = 86): string[] {
    const out: string[] = [];
    const dias = new Set(e.fijos.map((f) => f.dia));
    const canchas = new Set(e.fijos.map((f) => f.canchaId));
    const porFecha = new Map<string, typeof e.reservas>();
    for (const r of e.reservas) if (r.estado === "reservada" && r.fecha >= desde && canchas.has(r.canchaId)) porFecha.set(r.fecha, [...(porFecha.get(r.fecha) ?? []), r]);
    type Item = { quien: string; canchaId: string; inicio: number; fin: number; fijoSinBajar: boolean; deFijo: boolean };
    for (let i = 0; i < 7 * semanas; i++) {
      const fecha = M.sumarDias(desde, i);
      if (!dias.has(M.diaSemana(fecha))) continue;
      const items: Item[] = (porFecha.get(fecha) ?? []).map((r) => ({ quien: `turno de ${r.titular}`, canchaId: r.canchaId, inicio: r.inicio, fin: r.inicio + r.duracion, fijoSinBajar: false, deFijo: !!r.fijoId }));
      for (const f of e.fijos) if (M.fijoJuegaEl(f, fecha) && !M.fijoBajadoEl(e, f, fecha)) items.push({ quien: `fijo de ${f.titular}`, canchaId: f.canchaId, inicio: f.inicio, fin: f.inicio + f.duracion, fijoSinBajar: true, deFijo: true });
      for (let a = 0; a < items.length; a++)
        for (let b = a + 1; b < items.length; b++) {
          const x = items[a], y = items[b];
          if (x.canchaId !== y.canchaId || !(x.inicio < y.fin && y.inicio < x.fin)) continue;
          if ((x.fijoSinBajar && !y.deFijo) || (y.fijoSinBajar && !x.deFijo)) continue;
          out.push(`${fecha}:${x.quien}+${y.quien}`);
        }
    }
    return out;
  }

  /** Entradas de `liberadasPor` que esperan a un fijo que esa fecha NO juega, con el hueco libre de todo (fecha retenida). */
  function retenidas(e: EstadoClub, hoy = HOY): string[] {
    const out: string[] = [];
    for (const g of e.fijos)
      for (const x of g.liberadasPor ?? []) {
        if (x.fecha < hoy) continue;
        const esperado = e.fijos.find((h) => h.id === x.fijoId);
        if (esperado && M.fijoJuegaEl(esperado, x.fecha)) continue;
        const pisa = (i: number, f: number) => i < g.inicio + g.duracion && g.inicio < f;
        const otroFijo = e.fijos.some((h) => h.id !== g.id && h.canchaId === g.canchaId && pisa(h.inicio, h.inicio + h.duracion) && M.fijoJuegaEl(h, x.fecha));
        const turno = vivosEn(e, g.canchaId, x.fecha).some((r) => r.fijoId !== g.id && pisa(r.inicio, r.inicio + r.duracion));
        const bloqueo = e.bloqueos.some((b) => b.fecha === x.fecha && (b.canchaId === g.canchaId || b.canchaId === "*") && pisa(b.desde, b.hasta));
        if (!otroFijo && !turno && !bloqueo) out.push(`${g.titular} ${x.fecha} espera a ${esperado?.titular ?? "uno que ya no está"}`);
      }
    return out;
  }

  /** C4: Juan (el más antiguo) espera a Pedro el d(4) y el d(5); Pedro se pausa y esas fechas se le liberan por Tomi. */
  function trioC4() {
    const { e, f, P, canchaId, dia } = conPedro(d(4), { hasta: d(6) } as Partial<Fijo>);
    // Juan acorta: d(4)…d(6) se le liberan esperando a Pedro; vuelve el d(7).
    assert.equal(ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: d(3) }, AHORA).ok, true);
    assert.deepEqual(f.liberadasPor, [4, 5, 6].map((i) => ({ fecha: d(i), fijoId: P.id })));
    const T = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Tomi Heredado", desde: d(4) });
    T.hasta = d(5);
    return { e, f, P, T, canchaId, dia };
  }

  test("v9-1 (cert v8 C4) Pedro se pausa y sus fechas se le liberan por Tomi: Juan deja de esperarlo a él y, cuando Tomi se va, las recupera Juan (el más antiguo), no Pedro", () => {
    const { e, f, P, T } = trioC4();
    const pausa = { tipo: "pausa" as const, fijoId: P.id, desde: HOY, hasta: d(3) };
    const pp = previaBajaFijo(e, pausa, AHORA);
    const rp = ejecutarBajaFijo(e, pausa, AHORA);
    assert.equal(rp.ok, true, rp.mensaje);
    assert.ok(pp.ok && pp.recuperan.length === 0 && !rp.recuperan?.length, "nadie recupera: Tomi juega esas fechas");
    assert.deepEqual(P.liberadasPor, [4, 5].map((i) => ({ fecha: d(i), fijoId: T.id })));
    // Juan ya no espera a Pedro (que no juega el d(4) ni el d(5)): espera a Tomi, que es quien las juega.
    assert.deepEqual(f.liberadasPor, [{ fecha: d(4), fijoId: T.id }, { fecha: d(5), fijoId: T.id }, { fecha: d(6), fijoId: P.id }]);
    assert.deepEqual(doblesQueFiguran(e), []);
    const baja = { tipo: "baja" as const, fijoId: T.id, desde: HOY };
    const p = previaBajaFijo(e, baja, AHORA);
    const r = ejecutarBajaFijo(e, baja, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.ok(p.ok);
    if (!p.ok) return;
    assert.deepEqual(p.recuperan.map((x) => [x.titular, x.fechas]), [["Juan Fijo", [d(4), d(5)]]]);
    assert.deepEqual(r.recuperan?.map((x) => x.titular + x.fecha), [d(4), d(5)].map((x) => "Juan Fijo" + x));
    assert.match(r.mensaje, /Juan Fijo recupera el .* y el [^;]*\.$/);
    assert.doesNotMatch(r.mensaje, /Pedro Nuevo recupera/);
    assert.deepEqual([M.fijoJuegaEl(f, d(4)), M.fijoJuegaEl(f, d(5)), M.fijoJuegaEl(P, d(4)), M.fijoJuegaEl(P, d(5))], [true, true, false, false]);
    // Pedro queda esperando a Juan, el que las recuperó: si Juan se va, son de Pedro.
    assert.deepEqual(P.liberadasPor, [4, 5].map((i) => ({ fecha: d(i), fijoId: f.id })));
    assert.deepEqual(doblesQueFiguran(e), []);
    assert.deepEqual(retenidas(e), []);
    const rj = ejecutarBajaFijo(e, { tipo: "baja", fijoId: f.id, desde: d(4) }, AHORA);
    assert.deepEqual(rj.recuperan?.map((x) => x.titular + x.fecha), [4, 5].map((i) => "Pedro Nuevo" + d(i)));
    assert.deepEqual(doblesQueFiguran(e), []);
  });

  test("v9-2 (cert v8 C4) foto heredada: Juan quedó esperando a Pedro una fecha que Pedro ya no juega; la espera no le da prioridad a Pedro y la recupera el más antiguo", () => {
    const { e, f, P, T } = trioC4();
    // La foto que dejaba la v8: Pedro pausado con el d(4) liberado por Tomi, y Juan todavía esperando a Pedro.
    assert.equal(ejecutarBajaFijo(e, { tipo: "pausa", fijoId: P.id, desde: HOY, hasta: d(3) }, AHORA).ok, true);
    f.liberadasPor = [4, 5, 6].map((i) => ({ fecha: d(i), fijoId: P.id }));
    const r = ejecutarBajaFijo(e, { tipo: "baja", fijoId: T.id, desde: HOY }, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.deepEqual(r.recuperan?.map((x) => x.titular + x.fecha), [d(4), d(5)].map((x) => "Juan Fijo" + x));
    assert.deepEqual([M.fijoJuegaEl(P, d(4)), M.fijoJuegaEl(P, d(5))], [false, false]);
    // El d(6) Pedro sí lo juega: ésa sigue esperándolo a él.
    assert.deepEqual(f.liberadasPor, [{ fecha: d(6), fijoId: P.id }]);
    assert.deepEqual(doblesQueFiguran(e), []);
    assert.deepEqual(retenidas(e), []);
  });

  test("v9-3 (cert v8 C4) «Liberar el fijo» desde la grilla también suelta la fecha: la recupera el que la esperaba, se dice en el mensaje y queda en la grilla", () => {
    // Juan espera a Pedro el d(0) (semana a la vista); Pedro tiene ese turno en la grilla y lo libera desde el ciclo.
    const { e, f, P, canchaId } = conPedro(d(0), { hasta: d(1) } as Partial<Fijo>);
    M.materializarFijosHasta(e, HOY, 14);
    assert.equal(ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: M.sumarDias(d(0), -1) }, AHORA).ok, true);
    assert.deepEqual(f.liberadasPor, [0, 1].map((i) => ({ fecha: d(i), fijoId: P.id })));
    const turno = vivosEn(e, canchaId, d(0)).find((x) => x.fijoId === P.id)!;
    const r = ejecutarCiclo(e, turno.id, { tipo: "liberarFijo" }, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.match(r.mensaje, /no viene esta semana: .* Juan Fijo recupera el [^,;]*\.$/);
    assert.deepEqual(vivosEn(e, canchaId, d(0)).map((x) => x.fijoId), [f.id]);
    assert.deepEqual(f.liberadasPor, [{ fecha: d(1), fijoId: P.id }]);
    assert.deepEqual(doblesQueFiguran(e), []);
    assert.deepEqual(retenidas(e), []);
  });

  /** C1: Juan pausado; Pedro (heredado) ya tiene en la grilla el d(0) y el d(1). Juan acorta la pausa hasta antes del d(0). */
  function c1(extra: Partial<Fijo> = { hasta: d(1) } as Partial<Fijo>) {
    const b = conPedro(d(0), extra);
    M.materializarFijosHasta(b.e, HOY, 14);
    assert.deepEqual([0, 1].map((i) => vivosEn(b.e, b.canchaId, d(i)).map((x) => x.titular).join()), ["Pedro Nuevo", "Pedro Nuevo"]);
    return { ...b, acortar: { tipo: "pausa" as const, fijoId: b.f.id, desde: HOY, hasta: M.sumarDias(d(0), -1) } };
  }

  test("v9-4 (cert v8 C1) acortar la pausa contra el turno de otro fijo YA en la grilla: no se le devuelve esa fecha, la previa lo dice y la fecha espera a Pedro", () => {
    const { e, f, P, canchaId, acortar } = c1();
    const antes = doblesQueFiguran(e);
    const p = previaBajaFijo(e, acortar, AHORA);
    assert.ok(p.ok, !p.ok ? p.mensaje : "");
    if (!p.ok) return;
    assert.deepEqual(p.chocan.map((c) => [c.fecha, c.fijoId]), [[d(0), P.id], [d(1), P.id]]);
    assert.ok([0, 1].every((i) => p.lineas.some((l) => l.includes(fc(d(i))) && /no vuelve: se pisa con el fijo de Pedro Nuevo/.test(l))), p.lineas.join(" | "));
    assert.equal(p.vuelve, d(2));
    const r = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r.ok, true, r.mensaje);
    assert.match(r.mensaje, /vuelve solo el [^.]*\. No vuelven el .* ni el .*: se pisan con el fijo de Pedro Nuevo \(22:00\)\./);
    // Lo que se dice es lo que figura: Juan no juega el d(0) ni el d(1), y su tarjeta lo muestra liberado.
    assert.deepEqual([M.fijoJuegaEl(f, d(0)), M.fijoJuegaEl(f, d(1))], [false, false]);
    assert.deepEqual(f.liberadasPor, [0, 1].map((i) => ({ fecha: d(i), fijoId: P.id })));
    const tarjeta = armarFijos(e, AHORA).fijos.find((x) => x.id === f.id)!;
    assert.match(tarjeta.proximas, new RegExp(`${dm(d(0))} liberado`));
    assert.doesNotMatch(tarjeta.proximas, /sin bajar/);
    assert.deepEqual(antes, [], "antes de acortar no había dobles");
    assert.deepEqual(doblesQueFiguran(e), []);
    // Repetir el comando dice lo mismo y no cambia los fijos ni la grilla.
    const foto = fotoDeFijos(e);
    const r2 = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r2.mensaje, r.mensaje);
    assert.equal(fotoDeFijos(e), foto);
    // Si Pedro libera el d(0), lo recupera Juan: con aviso y con su turno en la grilla (antes volvía sin aviso).
    const lib = { tipo: "liberar" as const, fijoId: P.id, fecha: d(0) };
    const pl = previaBajaFijo(e, lib, AHORA);
    const rl = ejecutarBajaFijo(e, lib, AHORA);
    assert.ok(pl.ok && pl.recuperan.length === 1 && pl.recuperan[0].fechas.join() === d(0));
    assert.match(rl.mensaje, /Juan Fijo recupera el [^,;]*\.$/);
    assert.deepEqual(vivosEn(e, canchaId, d(0)).map((x) => x.fijoId), [f.id]);
    assert.deepEqual(doblesQueFiguran(e), []);
  });

  test("v9-5 (cert v8 C1) sin fecha de vuelta (Juan termina el d(1)) y los dos días ya son de Pedro en la grilla: la pausa se rechaza (Confirmar bloqueado) y no cambia nada", () => {
    const { e, f, acortar } = c1();
    f.hasta = d(1);
    const foto = JSON.stringify(e);
    const p = previaBajaFijo(e, acortar, AHORA);
    assert.ok(!p.ok);
    if (p.ok) return;
    assert.match(p.mensaje, /^El hueco es del fijo de Pedro Nuevo desde el .*: Juan Fijo no tiene a qué volver\. Dalo de baja o liberá sólo las fechas que no viene\.$/);
    const r = ejecutarBajaFijo(e, acortar, AHORA);
    assert.equal(r.ok, false);
    assert.equal(r.mensaje, p.mensaje);
    assert.equal(JSON.stringify(e), foto, "el rechazo no toca nada");
  });

  test("v9-6 (cert v7, texto) la vuelta cae el mismo día que el otro fijo juega: no dice «volvería el X, pero el X» y ofrece pausar hasta el último día de Pedro, que funciona", () => {
    // A9: Juan acorta y la pausa re-baja su turno del d(0) (Pedro, heredado, todavía no se bajó y juega d(0)…d(2)).
    const { e, f, P, acortar } = conPedro(d(0), { hasta: d(2) } as Partial<Fijo>);
    const foto = JSON.stringify(e);
    const r = ejecutarBajaFijo(e, { ...acortar, hasta: M.sumarDias(d(0), -1) }, AHORA);
    assert.equal(r.ok, false);
    const x = fc(d(0));
    assert.doesNotMatch(r.mensaje, new RegExp(`volvería el ${x}, pero el ${x}`));
    assert.match(r.mensaje, new RegExp(`^Juan Fijo no puede volver el ${x}: ese día el hueco también es del fijo de Pedro Nuevo \\(martes 22:00\\) y se pisarían\\.`));
    assert.match(r.mensaje, new RegExp(`Pausalo hasta el ${fc(d(2))} \\(el último día de Pedro Nuevo\\) y vuelve el ${fc(d(3))}, dalo de baja o liberá sólo las fechas que no viene\\.$`));
    assert.equal(JSON.stringify(e), foto);
    // Lo ofrecido se puede hacer desde la hoja y sale como se dijo.
    const ok = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: P.hasta! }, AHORA);
    assert.equal(ok.ok, true, ok.mensaje);
    assert.equal(ok.vuelve, d(3));
    assert.deepEqual(doblesQueFiguran(e), []);
  });

  test("v9-7 (cert v7 A3b, por comando) una pausa nueva que arranca después que la anterior volvería a darle a Juan una fecha que ya recuperó Pedro: se rechaza sin tocar nada", () => {
    const { e, f, canchaId, dia } = base();
    // Pedro (heredado) esperaba a Juan el d(1); Juan se pausa desde hoy y Pedro la recupera.
    const P = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: 22 * 60, duracion: 60, titular: "Pedro Nuevo", desde: d(1) });
    Object.assign(P, { hasta: d(1), excepciones: [d(1)], liberadasPor: [{ fecha: d(1), fijoId: f.id }] });
    const rp = ejecutarBajaFijo(e, { tipo: "pausa", fijoId: f.id, desde: HOY, hasta: d(5) }, AHORA);
    assert.match(rp.mensaje, /Pedro Nuevo recupera el /);
    assert.deepEqual(doblesQueFiguran(e), []);
    // El comando trae una pausa del d(2) al d(5): des-pausaría el d(0) y el d(1), y el d(1) es de Pedro.
    const foto = JSON.stringify(e);
    const a = { tipo: "pausa" as const, fijoId: f.id, desde: d(2), hasta: d(5) };
    const p = previaBajaFijo(e, a, AHORA);
    const r = ejecutarBajaFijo(e, a, AHORA);
    assert.ok(!p.ok && !r.ok);
    assert.equal(r.mensaje, `Juan Fijo está pausado desde el ${fc(HOY)}. Si la pausa nueva arranca el ${fc(d(2))}, volvería a jugar el ${fc(d(1))}, y ese día el hueco es del fijo de Pedro Nuevo (martes 22:00): se pisarían. Pausalo desde el ${fc(HOY)}.`);
    assert.equal(JSON.stringify(e), foto);
    assert.deepEqual(doblesQueFiguran(e), []);
    // Sin nadie en esas fechas, el comando pasa (no se rechaza de más).
    const libre = base();
    assert.equal(ejecutarBajaFijo(libre.e, { tipo: "pausa", fijoId: libre.f.id, desde: HOY, hasta: d(5) }, AHORA).ok, true);
    assert.equal(ejecutarBajaFijo(libre.e, { ...a, fijoId: libre.f.id }, AHORA).ok, true);
    assert.equal(M.fijoJuegaEl(libre.f, d(1)), true);
  });

  test("v9-8 (cert v8 C1 y C4, aleatorio) 5 semillas × 60 secuencias de 10 pasos con 3 a 5 fijos (Juan pausado y heredados de antes del guardián, algunos ya en la grilla): 0 dobles que figuren, 0 anuncios falsos, 0 fechas retenidas", () => {
    const SEMILLAS = [7, 20261028, 424242, 9001, 31337];
    const nuevos: string[] = [];
    const malAnunciados: string[] = [];
    const cambiosEnRechazos: string[] = [];
    const quedanRetenidas: string[] = [];
    // c1: fechas que la pausa no le devolvió al pausado porque el turno de otro fijo ya estaba en la grilla.
    // c4: esperas que dejaron de apuntar a un fijo que ya no juega esa fecha (re-apuntadas o recuperadas por antigüedad).
    const n = { pasos: 0, recuperaciones: 0, c1: 0, c4: 0, a3b: 0, grilla: 0, rechazos: 0 };
    const SEMANAS = 30; // las fechas en juego llegan al d(12) y la vuelta, unas semanas más
    for (const semilla0 of SEMILLAS) {
      let semilla = semilla0;
      const azar = (k: number) => {
        semilla ^= semilla << 13;
        semilla ^= semilla >>> 17;
        semilla ^= semilla << 5;
        return (semilla >>> 0) % k;
      };
      for (let corrida = 0; corrida < 60; corrida++) {
        const donde = `semilla ${semilla0} corrida ${corrida}`;
        const hora = () => [21 * 60 + 30, 22 * 60, 22 * 60, 22 * 60 + 30][azar(4)];
        // Heredados acotados y cortos (de 1 a 4 fechas), como los deja la UI vieja; de vez en cuando uno permanente.
        const desdeP = azar(5);
        const b = conPedro(d(desdeP), { hasta: d(desdeP + azar(4)), inicio: hora() } as Partial<Fijo>);
        let e = b.e;
        const { canchaId, dia } = b;
        const ids = [b.f.id, b.P.id];
        for (const titular of ["Ana Fija", "Tomi Heredado", "Lu Vieja"].slice(0, azar(3) + 1)) {
          const desde = azar(6);
          const g = M.crearFijo(e, { clienteId: null, canchaId, dia, inicio: hora(), duracion: 60, titular, desde: d(desde) });
          if (azar(8)) g.hasta = d(desde + azar(4));
          ids.push(g.id);
        }
        // Casi siempre los heredados ya están en la grilla con Juan en pausa (C1).
        if (azar(4)) M.materializarFijosHasta(e, HOY, 14);
        let ahora: Ahora = AHORA;
        let previa: EstadoClub | null = null;
        for (let paso = 0; paso < 10; paso++) {
          const t = azar(14);
          if (t === 12) {
            // Avanzar de 1 a 9 días y bajar la ventana (entra y sale de la semana a la vista).
            ahora = { fecha: M.sumarDias(ahora.fecha, 1 + azar(9)), min: AHORA.min };
            M.materializarFijosHasta(e, ahora.fecha, 14);
            continue;
          }
          if (t === 13) {
            // Deshacer (la foto de antes, como el almacén) o serializar e hidratar.
            if (previa && azar(2)) e = structuredClone(previa);
            else e = JSON.parse(JSON.stringify(e));
            continue;
          }
          // Para que la devolución se ejercite, la mitad de las veces actúa un fijo al que alguien espera (y sobre una
          // fecha que le esperan); si no, Juan (el que acorta la pausa contra la grilla, C1) o cualquiera del hueco.
          const esperados = e.fijos.flatMap((h) => (h.liberadasPor ?? []).filter((x) => x.fecha >= ahora.fecha));
          const foco = esperados.length && azar(2) ? esperados[azar(esperados.length)] : null;
          const g = e.fijos.find((x) => x.id === (foco ? foco.fijoId : azar(2) ? ids[0] : ids[azar(ids.length)]));
          if (!g) continue;
          const unaFecha = () => (foco && azar(2) ? foco.fecha : d(azar(9)));
          const antes = new Set(doblesQueFiguran(e, ahora.fecha, SEMANAS));
          const foto = JSON.stringify(e);
          const esperas = new Map(e.fijos.flatMap((h) => (h.liberadasPor ?? []).map((x) => [`${h.id}|${x.fecha}`, x.fijoId] as const)));
          previa = structuredClone(e);
          n.pasos++;
          let r: { ok: boolean; mensaje: string; recuperan?: { fijoId: string; titular: string; fecha: string }[]; chocan?: { fecha: string; fijoId?: string }[] };
          let que: string;
          if (t === 11) {
            // «Liberar el fijo» desde la grilla (ciclo del turno).
            const turnos = e.reservas.filter((x) => x.fijoId && ids.includes(x.fijoId) && x.estado === "reservada" && x.fecha >= ahora.fecha && M.minutosHasta(ahora, x.fecha, x.inicio) > 0);
            if (!turnos.length) continue;
            const turno = turnos[azar(turnos.length)];
            que = `grilla ${turno.titular} ${turno.fecha}`;
            r = ejecutarCiclo(e, turno.id, { tipo: "liberarFijo" }, ahora);
            n.grilla++;
          } else {
            const a: AccionBajaFijo =
              t <= 4
                ? { tipo: "pausa", fijoId: g.id, desde: ahora.fecha, hasta: M.sumarDias(d(azar(6)), -1 - azar(2)) }
                : t === 5
                  ? { tipo: "pausa", fijoId: g.id, desde: d(azar(4)), hasta: d(azar(9)) } // A3b: sólo por comando
                  : t <= 8
                    ? { tipo: "liberar", fijoId: g.id, fecha: unaFecha() }
                    : { tipo: "baja", fijoId: g.id, desde: foco && azar(2) ? foco.fecha : d(azar(12)) };
            if (a.tipo === "pausa" && (a.hasta < a.desde || a.desde < ahora.fecha)) continue;
            if (a.tipo === "pausa" && a.desde > ahora.fecha && g.pausa && a.desde > g.pausa.desde) n.a3b++;
            que = JSON.stringify(a);
            const p = previaBajaFijo(e, a, ahora);
            r = ejecutarBajaFijo(e, a, ahora);
            assert.equal(p.ok, r.ok, `${donde}: previa y comando dicen distinto: ${que} «${r.mensaje}»`);
            if (p.ok) assert.deepEqual(p.recuperan.flatMap((x) => x.fechas.map((y) => y + x.fijoId)).sort(), (r.recuperan ?? []).map((x) => x.fecha + x.fijoId).sort(), `${donde}: ${que}`);
            if (a.tipo === "pausa" && r.ok) n.c1 += (r.chocan ?? []).filter((c) => c.fijoId && vivosEn(e, canchaId, c.fecha).some((y) => y.fijoId === c.fijoId)).length;
          }
          if (!r.ok) {
            n.rechazos++;
            if (JSON.stringify(e) !== foto) cambiosEnRechazos.push(`${donde} paso ${paso}: ${que}`);
          }
          // C4: las esperas que apuntaban a un fijo que después de esto no juega esa fecha ya no lo esperan a él.
          // (La pausa de `g` que le suelta por choque fechas de fuera de la pausa, o una espera vieja a uno que no juega.)
          const fuera = (fecha: string) => !/"pausa"/.test(que) || fecha < (JSON.parse(que) as { desde: string }).desde || fecha > (JSON.parse(que) as { hasta: string }).hasta;
          if (r.ok)
            for (const [clave, esperado] of esperas) {
              const [hId, fecha] = clave.split("|");
              const ahoraEspera = e.fijos.find((h) => h.id === hId)?.liberadasPor?.find((x) => x.fecha === fecha)?.fijoId;
              const ese = e.fijos.find((h) => h.id === esperado);
              if (ahoraEspera !== esperado && (!ese || !M.fijoJuegaEl(ese, fecha)) && (esperado !== g.id || (t <= 5 && fuera(fecha)))) n.c4++;
            }
          for (const x of doblesQueFiguran(e, ahora.fecha, SEMANAS)) if (!antes.has(x)) nuevos.push(`${donde} paso ${paso} ${que} → ${x} «${r.mensaje}»`);
          for (const x of retenidas(e, ahora.fecha)) quedanRetenidas.push(`${donde} paso ${paso} ${que} → ${x}`);
          // Nunca un anuncio de algo que no se asignó: el que recupera juega esa fecha, nadie más la ocupa y, en la
          // semana a la vista, tiene su turno en la grilla.
          for (const x of r.recuperan ?? []) {
            n.recuperaciones++;
            const h = e.fijos.find((y) => y.id === x.fijoId)!;
            const pisa = (i: number, f: number) => i < h.inicio + h.duracion && h.inicio < f;
            const otro = e.fijos.find((y) => y.id !== h.id && y.canchaId === h.canchaId && pisa(y.inicio, y.inicio + y.duracion) && M.fijoJuegaEl(y, x.fecha));
            const ajenos = vivosEn(e, h.canchaId, x.fecha).filter((y) => y.fijoId !== h.id && pisa(y.inicio, y.inicio + y.duracion));
            const enGrilla = vivosEn(e, h.canchaId, x.fecha).some((y) => y.fijoId === h.id);
            if (!M.fijoJuegaEl(h, x.fecha) || otro || ajenos.length || (x.fecha < M.sumarDias(ahora.fecha, DIAS_A_LA_VISTA) && !enGrilla)) malAnunciados.push(`${donde} paso ${paso}: ${x.titular} ${x.fecha}`);
          }
          // El ciclo no trae `recuperan`: lo que dice su mensaje se controla contra el fijo y la grilla.
          if (t === 11 && /recupera/.test(r.mensaje)) {
            n.recuperaciones++;
            const fecha = que.slice(-10);
            for (const h of e.fijos)
              if (r.mensaje.includes(`${h.titular} recupera`)) {
                const enGrilla = vivosEn(e, h.canchaId, fecha).some((y) => y.fijoId === h.id);
                if (!M.fijoJuegaEl(h, fecha) || (fecha < M.sumarDias(ahora.fecha, DIAS_A_LA_VISTA) && !enGrilla)) malAnunciados.push(`${donde} paso ${paso}: ${r.mensaje}`);
              }
          }
        }
      }
    }
    assert.deepEqual(nuevos.slice(0, 5), [], `${nuevos.length} dobles nuevos que figuran`);
    assert.deepEqual(malAnunciados.slice(0, 5), [], `${malAnunciados.length} anuncios de algo que no se asignó`);
    assert.deepEqual(cambiosEnRechazos.slice(0, 5), [], `${cambiosEnRechazos.length} rechazos que cambiaron el estado`);
    assert.deepEqual(quedanRetenidas.slice(0, 5), [], `${quedanRetenidas.length} fechas retenidas esperando a uno que no juega`);
    // El azar tiene que ejercitar lo que se arregló.
    assert.ok(n.recuperaciones > 80 && n.c1 > 30 && n.c4 > 10 && n.a3b > 50 && n.grilla > 50, JSON.stringify(n));
    console.log(`v9-8: ${JSON.stringify(n)}`);
  });
}
