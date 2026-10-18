// Novedades y redes contra el motor REAL sobre la demo: a cuántos les llega cada audiencia, preparar el envío (sólo
// un dueño), uno por uno (queda tildado, sin repetir), la lista de difusión (mensaje + CSV), «respondé BAJA» y la
// baja (no le llega más, ni en un envío a medias), el historial y el calendario de contenido (alta, edición, borrado).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { operadorDeLaDemo } from "./almacen";
import {
  BORRADOR_VACIO,
  DESHACIBLES_NOVEDADES,
  armarBajas,
  armarCalendario,
  armarEnvio,
  armarHistorial,
  csvDeLaDifusion,
  datosDePublicacion,
  ejecutarNovedades,
  mesVecino,
  vistaPrevia,
  type Borrador,
} from "./novedades-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = (): { e: EstadoClub; recep: Auth; duenio: Auth } => {
  const e = M.generarDemo(HOY, AHORA.min);
  return { e, recep: operadorDeLaDemo(e, "RECEPTION")!.auth, duenio: operadorDeLaDemo(e, "OWNER")!.auth };
};
const torneo: Borrador = { tipo: "torneo", titulo: "Torneo de categorías el sábado 25", texto: "Anotate en recepción. $ 8.000 por pareja.", audiencia: "todos" };

function preparado(borrador: Borrador = torneo) {
  const d = demo();
  const r = ejecutarNovedades(d.e, { tipo: "preparar", borrador }, AHORA, d.duenio);
  assert.equal(r.ok, true, r.mensaje);
  return { ...d, difusionId: r.difusionId! };
}

test("la vista previa: a cuántos les llega cada audiencia y el mensaje con «respondé BAJA»", () => {
  const { e } = demo();
  const todos = vistaPrevia(e, AHORA, torneo);
  assert.equal(todos.cuantos, M.destinatarios(e, "todos", AHORA).length);
  assert.ok(todos.cuantos > 0);
  assert.equal(vistaPrevia(e, AHORA, { ...torneo, audiencia: "cuentaCorriente" }).cuantos, e.clientes.filter((c) => c.cc.habilitada && c.tel.replace(/\D/g, "").length >= 8).length);
  assert.ok(todos.mensaje.startsWith("¡Hola Juan! *Torneo de categorías el sábado 25*\nAnotate en recepción."));
  assert.ok(todos.mensaje.endsWith("(Si no querés recibir más novedades, respondé BAJA.)"));
  assert.match(vistaPrevia(e, AHORA, BORRADOR_VACIO).mensaje, /\*Título de la novedad\*/, "sin título, se ve dónde va");
});

test("preparar el envío: sólo un dueño, con título; a nadie no se prepara", () => {
  const { e, recep, duenio } = demo();
  assert.equal(ejecutarNovedades(e, { tipo: "preparar", borrador: torneo }, AHORA, recep).ok, false, "recepción no manda novedades");
  assert.equal(ejecutarNovedades(e, { tipo: "preparar", borrador: { ...torneo, titulo: "  " } }, AHORA, duenio).mensaje, "Poné el título de la novedad.");
  const nadie = ejecutarNovedades(e, { tipo: "preparar", borrador: { ...torneo, audiencia: "recuperar" } }, AHORA, duenio);
  if (M.destinatarios(e, "recuperar", AHORA).length === 0) {
    assert.equal(nadie.ok, false);
    assert.match(nadie.mensaje, /^No le llega a nadie/);
    assert.equal(e.difusiones.length, 0, "no queda una novedad vacía en el historial");
  }
  const r = ejecutarNovedades(e, { tipo: "preparar", borrador: torneo }, AHORA, duenio);
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.mensaje, `Listo para mandar a ${M.destinatarios(e, "todos", AHORA).length} cliente(s).`);
  assert.equal(e.difusiones[0].id, r.difusionId);
  assert.equal(DESHACIBLES_NOVEDADES.has("preparar"), false);
  assert.equal(DESHACIBLES_NOVEDADES.has("enviado"), false, "lo mandado no se deshace");
});

test("uno por uno: cada nombre abre WhatsApp con SU mensaje (en la demo, sin número) y queda tildado una sola vez", () => {
  const { e, recep, duenio, difusionId } = preparado();
  const v = armarEnvio(e, difusionId, "demo")!;
  assert.equal(v.enviados, 0);
  assert.equal(v.total, v.contactos.length);
  const [primero, segundo] = v.contactos;
  assert.match(primero.enlace!.href, /^https:\/\/wa\.me\/\?text=/, "en la demo, para elegir el chat");
  assert.ok(primero.enlace!.texto.startsWith(`¡Hola ${primero.nombre.split(" ")[0]}! `), "con su nombre de pila");
  assert.ok(v.nota, "la nota de la demo, una vez para toda la lista");
  assert.equal(v.mensaje.startsWith("¡Hola! *Torneo"), true, "el de la lista de difusión va sin nombre");

  assert.equal(ejecutarNovedades(e, { tipo: "enviado", difusionId, clienteId: primero.clienteId }, AHORA, recep).ok, false, "tildar es de un dueño");
  const r = ejecutarNovedades(e, { tipo: "enviado", difusionId, clienteId: primero.clienteId }, AHORA, duenio);
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(r.mensaje, `Anotado: le mandaste a ${primero.nombre.split(" ")[0]}. Faltan ${v.total - 1}.`);
  ejecutarNovedades(e, { tipo: "enviado", difusionId, clienteId: primero.clienteId }, AHORA, duenio);
  const v2 = armarEnvio(e, difusionId, "demo")!;
  assert.equal(v2.enviados, 1, "dos toques, un envío");
  assert.equal(v2.contactos[0].hecho, true);
  assert.equal(v2.contactos[1].hecho, false);
  assert.notEqual(v2.firma, v.firma);
  const ajeno = e.clientes.find((c) => !e.difusiones[0].destinatarios.includes(c.id));
  if (ajeno) assert.equal(ejecutarNovedades(e, { tipo: "enviado", difusionId, clienteId: ajeno.id }, AHORA, duenio).ok, false);

  // Con datos reales, al celular del cliente (formato argentino).
  const real = armarEnvio(e, difusionId, "real")!;
  const conTel = real.contactos.find((c) => c.clienteId === segundo.clienteId)!;
  assert.equal(conTel.enlace!.directo, true, conTel.enlace!.nota ?? "");
  assert.match(conTel.enlace!.href, /^https:\/\/wa\.me\/549\d{10}\?text=/);
  assert.equal(armarEnvio(e, "no-existe", "demo"), null);
});

test("la lista de difusión: el CSV con nombre y celular (+ y sólo dígitos), sin los que pidieron la baja", () => {
  const { e, duenio, difusionId } = preparado();
  const csv = csvDeLaDifusion(e, difusionId, HOY)!;
  assert.equal(csv.archivo, `novedades-del-club-${HOY}.csv`);
  assert.ok(csv.texto.startsWith("﻿Nombre,Celular\r\n"));
  const lineas = csv.texto.split("\r\n");
  assert.equal(lineas.length - 1, csv.cuantos);
  assert.match(lineas[1], /^"[^"]+","\+\d{8,}"$/);
  const uno = e.clientes.find((c) => c.id === e.difusiones[0].destinatarios[0])!;
  assert.equal(ejecutarNovedades(e, { tipo: "baja", clienteId: uno.id, volver: false }, AHORA, duenio).ok, true);
  const despues = csvDeLaDifusion(e, difusionId, HOY)!;
  assert.equal(despues.cuantos, csv.cuantos - 1);
  assert.ok(!despues.texto.includes(uno.nombre), "el que pidió la baja no va en la lista");
});

test("«respondé BAJA»: se busca, se le da la baja (no le llega más, ni en el envío a medias) y se puede volver a sumar", () => {
  const { e, duenio, difusionId } = preparado();
  const antes = vistaPrevia(e, AHORA, torneo).cuantos;
  const objetivo = e.clientes.find((c) => c.id === e.difusiones[0].destinatarios[1])!;
  assert.deepEqual(armarBajas(e, "").candidatos, [], "sin búsqueda no lista a todos");
  const buscados = armarBajas(e, objetivo.nombre.split(" ")[0].toLowerCase());
  assert.ok(buscados.candidatos.some((c) => c.id === objetivo.id));
  assert.ok(buscados.candidatos.length <= 6);
  const r = ejecutarNovedades(e, { tipo: "baja", clienteId: objetivo.id, volver: false }, AHORA, duenio);
  assert.equal(r.mensaje, `${objetivo.nombre} no recibe más novedades: ya no le llega.`);
  assert.equal(vistaPrevia(e, AHORA, torneo).cuantos, antes - 1);
  const b = armarBajas(e, objetivo.nombre);
  assert.deepEqual(b.deBaja.map((c) => c.id), [objetivo.id]);
  assert.ok(!b.candidatos.some((c) => c.id === objetivo.id), "ya no figura para dar de baja");
  const envio = armarEnvio(e, difusionId, "demo")!;
  const fila = envio.contactos.find((c) => c.clienteId === objetivo.id)!;
  assert.equal(fila.baja, true);
  assert.equal(fila.enlace, null, "sin link: no se le manda");
  assert.equal(ejecutarNovedades(e, { tipo: "enviado", difusionId, clienteId: objetivo.id }, AHORA, duenio).ok, false);
  assert.equal(envio.total, envio.contactos.length - 1);
  // Volver a sumarlo.
  const v = ejecutarNovedades(e, { tipo: "baja", clienteId: objetivo.id, volver: true }, AHORA, duenio);
  assert.equal(v.mensaje, `${objetivo.nombre} vuelve a recibir las novedades del club.`);
  assert.equal(armarBajas(e, "").deBaja.length, 0);
  assert.equal(DESHACIBLES_NOVEDADES.has("baja"), true);
});

test("el historial: de lo más nuevo a lo más viejo, con a quiénes, quién y cuántos van", () => {
  const { e, duenio, difusionId } = preparado();
  const segunda = ejecutarNovedades(e, { tipo: "preparar", borrador: { tipo: "promo", titulo: "2x1 en el buffet", texto: "", audiencia: "cuentaCorriente" } }, AHORA, duenio);
  assert.equal(segunda.ok, true, segunda.mensaje);
  const h = armarHistorial(e);
  assert.deepEqual(h.filas.map((f) => f.titulo), ["2x1 en el buffet", "Torneo de categorías el sábado 25"]);
  assert.equal(h.filas[0].tipo, "Promo");
  assert.equal(h.filas[0].audiencia, M.AUDIENCIAS.cuentaCorriente);
  assert.equal(h.filas[1].id, difusionId);
  assert.equal(h.filas[1].cuando, "17/10 19:10");
  assert.equal(h.filas[1].autor, M.usuario(e, duenio.usuarioId!)!.nombre);
});

test("el calendario: el mes con sus huecos (la semana arranca el lunes), el resumen y la navegación", () => {
  const { e } = demo();
  const c = armarCalendario(e, "2026-10", HOY);
  assert.equal(c.titulo, "octubre de 2026");
  assert.equal(c.dias.length, 31);
  assert.equal(c.vacias, 3, "el 1/10/2026 es jueves");
  assert.equal(c.dias.find((d) => d.hoy)!.fecha, HOY);
  assert.equal(c.total, M.contenidoDelMes(e, 2026, 10).length);
  assert.match(c.resumen, /^Idea: \d+ · Programado: \d+ · Publicado: \d+$/);
  const con = c.dias.find((d) => d.publicaciones.length)!;
  assert.match(con.publicaciones[0].descripcion, /^\d{2}:\d{2} · .+ · (Instagram|WhatsApp) · .+ · (Idea|Programado|Publicado)$/);
  assert.equal(mesVecino("2026-10", 1), "2026-11");
  assert.equal(mesVecino("2026-01", -1), "2025-12");
  assert.equal(mesVecino("2026-10", -10), "2025-12");
  assert.equal(armarCalendario(e, "2027-02", HOY).dias.length, 28);
});

test("el calendario: el dueño agenda, edita y borra; recepción no; la hora y el título se validan", () => {
  const { e, recep, duenio } = demo();
  const nueva = datosDePublicacion(e, null, "2026-10-24");
  assert.deepEqual(nueva, { fecha: "2026-10-24", hora: "19:00", canal: "post", estado: "idea", titulo: "", texto: "" });
  assert.equal(ejecutarNovedades(e, { tipo: "guardarPublicacion", id: null, datos: { ...nueva, titulo: "Torneo" } }, AHORA, recep).ok, false);
  assert.equal(ejecutarNovedades(e, { tipo: "guardarPublicacion", id: null, datos: nueva }, AHORA, duenio).mensaje, "Poné de qué se trata la publicación.");
  assert.equal(ejecutarNovedades(e, { tipo: "guardarPublicacion", id: null, datos: { ...nueva, titulo: "Torneo", hora: "25:00" } }, AHORA, duenio).mensaje, "Elegí la hora.");
  const r = ejecutarNovedades(e, { tipo: "guardarPublicacion", id: null, datos: { ...nueva, titulo: "  Reel del torneo  ", canal: "reel", estado: "programado" } }, AHORA, duenio);
  assert.equal(r.mensaje, "Publicación agendada para el 24/10.");
  const c = e.contenido.find((x) => x.titulo === "Reel del torneo")!;
  assert.equal(c.canal, "reel");
  const dia = armarCalendario(e, "2026-10", HOY).dias.find((d) => d.fecha === "2026-10-24")!;
  assert.ok(dia.publicaciones.some((p) => p.descripcion === "19:00 · Reel del torneo · Instagram · reel · Programado"));
  const editar = datosDePublicacion(e, c.id, HOY);
  assert.equal(editar.fecha, "2026-10-24", "abre con lo suyo, no con la fecha pedida");
  assert.equal(ejecutarNovedades(e, { tipo: "guardarPublicacion", id: c.id, datos: { ...editar, estado: "publicado" } }, AHORA, duenio).mensaje, "Publicación guardada.");
  assert.equal(e.contenido.find((x) => x.id === c.id)!.estado, "publicado");
  assert.equal(ejecutarNovedades(e, { tipo: "borrarPublicacion", id: c.id }, AHORA, recep).ok, false);
  assert.equal(ejecutarNovedades(e, { tipo: "borrarPublicacion", id: c.id }, AHORA, duenio).mensaje, "Publicación borrada: «Reel del torneo».");
  assert.equal(ejecutarNovedades(e, { tipo: "borrarPublicacion", id: c.id }, AHORA, duenio).ok, false);
});
