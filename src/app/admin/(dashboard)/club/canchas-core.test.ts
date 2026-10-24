// Mantenimiento, bloqueos, turnos fijos y lista de espera contra el motor REAL sobre la demo.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { DIAS_A_LA_VISTA, SE_DESHACE, bajaFijo, armarCanchas, armarEspera, armarFijos, bajarFijos, ejecutarBajaFijo, ejecutarCanchas, ejecutarEspera, fijosPorBajar, horasDelDia, nuevoFijo, previaBajaFijo, textoAvisoBaja } from "./canchas-core";
import { armarAgenda } from "./agenda-core";
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
  assert.ok(fijosPorBajar(e, en7) >= 1, "el +7 figura como por bajar");
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(vivos(en7), 1, "el +7 vuelve a la grilla");
  assert.equal(vivos(en14), 1, "el +14 también");
  assert.equal(fijosPorBajar(e, en7), 0);
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(vivos(en7), 1, "idempotente: no se duplica");
  // La baja y «liberar» siguen contando como bajadas (no reviven).
  assert.equal(ejecutarBajaFijo(e, { tipo: "liberar", fijoId: f.id, fecha: en14 }, AHORA).ok, true);
  M.materializarFijosHasta(e, HOY, 14);
  assert.equal(vivos(en14), 0, "lo liberado no vuelve");
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
