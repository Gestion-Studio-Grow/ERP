// Mantenimiento, bloqueos, turnos fijos y lista de espera contra el motor REAL sobre la demo.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import { DIAS_A_LA_VISTA, SE_DESHACE, bajaFijo, armarCanchas, armarEspera, armarFijos, bajarFijos, ejecutarCanchas, ejecutarEspera, horasDelDia, nuevoFijo } from "./canchas-core";
import { armarAgenda } from "./agenda-core";
import { avisosLluvia } from "./whatsapp-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): EstadoClub => M.generarDemo(HOY, AHORA.min);

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

test("qué se deshace, como en el club vanilla: ni lluvia, ni mantenimiento, ni bloqueos, ni fijos, ni sacar de la espera", () => {
  for (const k of ["lluvia", "mantenimiento", "bloquear", "quitarBloqueo", "nuevoFijo", "bajarFijos", "bajaFijo", "quitar"] as const) assert.equal(SE_DESHACE[k], false, k);
  for (const k of ["anotar", "asignar"] as const) assert.equal(SE_DESHACE[k], true, k);
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

test("plan lluvia: devuelve lo que pasó con cada turno y los avisos por WhatsApp salen de eso", () => {
  const e = demo();
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
