// Tests de lo puro del Studio de contenido del club (public/previews/breakpoint/club/studio.mjs): caption en
// criollo, partido de renglones, estado inicial desde una pieza y lo que se manda al calendario.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as studio from "../../../public/previews/breakpoint/club/studio.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any -- el módulo es JS plano: los tipos inferidos son estrechos para armar casos a mano */
const S: any = studio;

// Medida falsa y determinística: 10 px por carácter.
const medir = (t: string) => t.length * 10;

test("partirLineas respeta el ancho, los saltos de línea y corta palabras más anchas que el renglón", () => {
  assert.deepEqual(S.partirLineas("hola que tal", 70, medir), ["hola", "que tal"]);
  assert.deepEqual(S.partirLineas("uno\ndos tres", 200, medir), ["uno", "dos tres"]);
  assert.deepEqual(S.partirLineas("supercalifragilistico", 50, medir), ["super", "calif", "ragil", "istic", "o"]);
  assert.deepEqual(S.partirLineas("", 100, medir), []);
  for (const l of S.partirLineas("Torneo relámpago de primavera en Break Point", 120, medir)) assert.ok(medir(l) <= 120, l);
});

test("ajustarLineas deja el máximo y cierra con «…» dentro del ancho", () => {
  const ls = S.ajustarLineas(["aaaaa", "bbbbb", "ccccc"], 2, 50, medir);
  assert.equal(ls.length, 2);
  assert.ok(ls[1].endsWith("…"));
  assert.ok(medir(ls[1]) <= 50);
  assert.deepEqual(S.ajustarLineas(["a", "b"], 3, 50, medir), ["a", "b"]);
});

test("el caption del torneo va en criollo, salta lo vacío y lleva WhatsApp y hashtags del club", () => {
  const c = S.armarCaption("torneo", { titulo: "Copa Primavera", categorias: "4ta y 5ta", cuando: "", inscripcion: "$20.000 por pareja", premio: "" });
  assert.match(c, /^🏆 Copa Primavera/);
  assert.match(c, /Categorías: 4ta y 5ta/);
  assert.match(c, /Inscripción: \$20\.000 por pareja/);
  assert.doesNotMatch(c, /Premios|📅/);
  assert.match(c, /Anotate por WhatsApp al 11 6187-0066/);
  assert.match(c, /#BreakPointPadel #PadelEzeiza/);
  assert.doesNotMatch(c, /\n{3,}/, "nunca dos renglones en blanco seguidos");
  assert.doesNotMatch(c, /undefined|null/);
});

test("captions de turnos, promo, buffet y novedad (y una plantilla desconocida cae en novedad)", () => {
  const t = S.armarCaption("turnos", { titulo: "Turnos libres hoy", horarios: "10:00\n\n 11:30 \n" });
  assert.match(t, /• 10:00\n• 11:30/);
  assert.match(t, /turnero/);
  assert.match(S.armarCaption("promo", { titulo: "Valle", precio: "2x1", vigencia: "hasta el viernes" }), /👉 2x1\n🗓️ Vale hasta el viernes/);
  assert.match(S.armarCaption("buffet", { titulo: "Milanesa", precio: "$14.500" }), /^🍽️ Milanesa · \$14\.500/);
  assert.match(S.armarCaption("buffet", {}), /#DeliciasBreak/);
  assert.match(S.armarCaption("cualquiera", { titulo: "Abrimos la cancha 4", texto: "Desde el lunes." }), /^📣 Abrimos la cancha 4\n\nDesde el lunes\./);
});

test("estadoInicial: sin pieza arranca con el ejemplo del torneo; con pieza precarga y no inventa datos", () => {
  const hoy = new Date(2026, 9, 16, 10, 0);
  const vacio = S.estadoInicial(null, hoy);
  assert.equal(vacio.plantilla, "torneo");
  assert.equal(vacio.formato, "post");
  assert.equal(vacio.fecha, "2026-10-16");
  assert.ok(vacio.valores.categorias);

  const nov = S.estadoInicial({ titulo: "Nueva iluminación", texto: "Ya está.", fecha: "2026-10-20", hora: "18:30", canal: "historia" }, hoy);
  assert.equal(nov.plantilla, "novedad");
  assert.equal(nov.formato, "historia");
  assert.equal(nov.valores.titulo, "Nueva iluminación");
  assert.equal(nov.valores.categorias, "", "con pieza, lo que no vino queda vacío");
  assert.deepEqual([nov.fecha, nov.hora], ["2026-10-20", "18:30"]);

  assert.equal(S.estadoInicial({ titulo: "Promo", precio: "$5.000" }, hoy).plantilla, "promo");
  const mala = S.estadoInicial({ plantilla: "buffet", fecha: "mañana", hora: "25:00" }, hoy);
  assert.deepEqual([mala.plantilla, mala.fecha, mala.hora], ["buffet", "2026-10-16", "19:00"]);
});

test("datosParaGuardar arma el objeto de alGuardar (canal post/historia) y valida fecha, hora y caption", () => {
  const base = { plantilla: "torneo", formato: "vertical", valores: { titulo: "  Copa  " }, caption: " hola ", fecha: "2026-10-20", hora: "19:00" };
  assert.deepEqual(S.datosParaGuardar(base), { ok: true, datos: { titulo: "Copa", texto: "hola", canal: "post", fecha: "2026-10-20", hora: "19:00" } });
  assert.equal(S.datosParaGuardar({ ...base, formato: "historia" }).datos.canal, "historia");
  assert.equal(S.datosParaGuardar({ ...base, valores: {} }).datos.titulo, "Torneo");
  assert.equal(S.datosParaGuardar({ ...base, fecha: "" }).ok, false);
  assert.equal(S.datosParaGuardar({ ...base, hora: "7pm" }).ok, false);
  assert.equal(S.datosParaGuardar({ ...base, caption: "   " }).ok, false);
});

test("nombreArchivo del PNG", () => {
  assert.equal(S.nombreArchivo("promo", "2026-10-20"), "breakpoint-promo-2026-10-20.png");
  assert.equal(S.nombreArchivo("x", ""), "breakpoint-pieza-sin-fecha.png");
});

test("cada plantilla usa campos que existen y tiene ejemplo, rótulo y llamado", () => {
  for (const [k, p] of Object.entries<any>(S.PLANTILLAS)) {
    for (const c of p.campos) assert.ok(c in S.CAMPOS, `${k}: campo ${c}`);
    assert.ok(p.rotulo && p.cta && p.ejemplo.titulo, k);
  }
  assert.deepEqual(Object.keys(S.PLANTILLAS), ["torneo", "promo", "turnos", "novedad", "buffet"]);
});
