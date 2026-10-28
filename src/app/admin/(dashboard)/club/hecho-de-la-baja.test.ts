// «Hecho» de la hoja de los fijos, sin navegador (renderToStaticMarkup): la nota de cada «Avisar a … que recupera su
// turno» (dictamen v7, observación BAJA de `notaEn`). Cada botón anuncia SU nota (`aria-describedby`); si es la misma
// que la del titular se muestra una sola vez, y si es otra va al lado de su botón.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HechoDeLaBaja, type Hecho } from "./HechoDeLaBaja";
import { NOTA_CELULAR_RARO, NOTA_DEMO, NOTA_SIN_CELULAR, type ModoDelClub } from "./whatsapp-core";

const CEL = "11 5555 1234";
const hecho = (celular: string, recuperan: { titular: string; celular: string }[]): Hecho => ({
  fijoId: "f1",
  titular: "Pedro Nuevo",
  mensaje: "Dado de baja el fijo de Pedro Nuevo (martes 22:00). Juan Fijo recupera el mar 3/11.",
  texto: "¡Hola Pedro!",
  celular,
  recuperan: recuperan.map((r) => ({ ...r, texto: `¡Hola ${r.titular}!` })),
});
const pintar = (x: Hecho, modo: ModoDelClub) => renderToStaticMarkup(h(HechoDeLaBaja, { hecho: x, modo, onListo: () => undefined }));
const veces = (html: string, texto: string) => html.split(texto).length - 1;
/** El id de la nota que anuncia el botón con ese nombre accesible, y el texto del elemento con ese id. */
function notaDelBoton(html: string, nombre: string): string | null {
  const boton = new RegExp(`<a[^>]*aria-label="${nombre}"[^>]*>`).exec(html)?.[0];
  assert.ok(boton, `no está el botón «${nombre}»`);
  const id = /aria-describedby="([^"]+)"/.exec(boton)?.[1];
  if (!id) return null;
  return new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1] ?? "(sin texto)";
}

test("v9 (cert v7, notaEn) en la demo la nota sale UNA vez y la anuncian el botón del titular y los de quienes recuperan", () => {
  const html = pintar(hecho(CEL, [{ titular: "Juan Fijo", celular: CEL }, { titular: "Ana Fija", celular: "" }]), "demo");
  assert.equal(veces(html, NOTA_DEMO), 1, html);
  assert.equal(notaDelBoton(html, "Avisar a Pedro Nuevo por WhatsApp"), NOTA_DEMO);
  assert.equal(notaDelBoton(html, "Avisar a Juan Fijo que recupera su turno"), NOTA_DEMO);
  assert.equal(notaDelBoton(html, "Avisar a Ana Fija que recupera su turno"), NOTA_DEMO);
});

test("v9 (cert v7, notaEn) en serio: el titular tiene celular y el que recupera no → su nota va con su botón; el que tiene celular no lleva nota", () => {
  const html = pintar(hecho(CEL, [{ titular: "Juan Fijo", celular: "" }, { titular: "Ana Fija", celular: CEL }]), "real");
  assert.equal(notaDelBoton(html, "Avisar a Pedro Nuevo por WhatsApp"), null);
  assert.equal(notaDelBoton(html, "Avisar a Juan Fijo que recupera su turno"), NOTA_SIN_CELULAR);
  assert.equal(notaDelBoton(html, "Avisar a Ana Fija que recupera su turno"), null);
  assert.equal(veces(html, NOTA_SIN_CELULAR), 1);
});

test("v9 (cert v7, notaEn) en serio: notas distintas se muestran las dos; iguales, una sola vez", () => {
  const distintas = pintar(hecho("", [{ titular: "Juan Fijo", celular: "+1 202 555 0100" }]), "real");
  assert.equal(notaDelBoton(distintas, "Avisar a Pedro Nuevo por WhatsApp"), NOTA_SIN_CELULAR);
  assert.equal(notaDelBoton(distintas, "Avisar a Juan Fijo que recupera su turno"), NOTA_CELULAR_RARO);
  assert.deepEqual([veces(distintas, NOTA_SIN_CELULAR), veces(distintas, NOTA_CELULAR_RARO)], [1, 1]);
  const iguales = pintar(hecho("", [{ titular: "Juan Fijo", celular: "" }]), "real");
  assert.equal(notaDelBoton(iguales, "Avisar a Juan Fijo que recupera su turno"), NOTA_SIN_CELULAR);
  assert.equal(veces(iguales, NOTA_SIN_CELULAR), 1);
});
