import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarMes,
  armarSemana,
  diaDeLaSemana,
  esFechaValida,
  fechaLocal,
  inicioDeSemana,
  mesVecino,
  recordatoriosDelDia,
  resumenDeEstados,
  semanaVecina,
  sumarDias,
} from "./calendario";
import type { Publicacion } from "./tipos";

const pub = (id: string, fecha: string, hora: string, estado: Publicacion["estado"] = "programado"): Publicacion => ({
  id,
  fecha,
  hora,
  canal: "instagram",
  estado,
  tipo: "promo",
  plantilla: "promo-bloque",
  formato: "post",
  titulo: `Pub ${id}`,
  texto: "",
  campos: { rotulo: "Promo", titulo: `Pub ${id}`, bajada: "", cta: "Aprovechala" },
  caption: { instagram: "", whatsapp: "" },
});

test("mes que arranca en domingo: 6 huecos y grilla lunes primero", () => {
  const v = armarMes([pub("a", "2026-11-05", "19:00"), pub("b", "2026-12-01", "10:00")], "2026-11", "2026-11-04");
  assert.equal(v.titulo, "noviembre de 2026");
  assert.equal(v.vacias, 6);
  assert.equal(v.dias.length, 30);
  assert.equal(v.semanas.length, 6);
  assert.ok(v.semanas.every((s) => s.length === 7));
  assert.equal(v.semanas[0][6]?.fecha, "2026-11-01");
  assert.equal(v.semanas[0][6]?.dia, "dom");
  assert.equal(v.semanas[0][0], null);
  assert.equal(v.dias[3].hoy, true);
  assert.equal(v.dias[4].publicaciones.length, 1);
  assert.match(v.dias[4].publicaciones[0].descripcion, /19:00 · Pub a · Instagram · ◷ Programado/);
  assert.equal(v.resumen.total, 1, "la de diciembre no entra");
});

test("mes que arranca en lunes no tiene huecos", () => {
  assert.equal(armarMes([], "2026-06", "2026-06-01").vacias, 0);
});

test("mesVecino cruza años", () => {
  assert.equal(mesVecino("2026-01", -1), "2025-12");
  assert.equal(mesVecino("2026-12", 1), "2027-01");
});

test("semana: de lunes a domingo, cruzando mes", () => {
  const s = armarSemana([pub("a", "2026-12-03", "19:00"), pub("b", "2026-12-07", "09:00")], "2026-12-03", "2026-12-03");
  assert.equal(s.desde, "2026-11-30");
  assert.equal(s.hasta, "2026-12-06");
  assert.equal(s.titulo, "30 de noviembre al 6 de diciembre de 2026");
  assert.equal(s.dias.length, 7);
  assert.equal(s.dias[0].dia, "lun");
  assert.equal(s.resumen.total, 1);
  assert.equal(semanaVecina("2026-12-03", 1), "2026-12-07");
  assert.equal(semanaVecina("2026-12-03", -1), "2026-11-23");
  assert.equal(armarSemana([], "2026-11-04", "2026-11-04").titulo, "2 al 8 de noviembre de 2026");
});

test("criterio 2: jueves 19:00 programada aparece en mes y semana", () => {
  const p = pub("j", "2026-11-05", "19:00");
  assert.equal(diaDeLaSemana(p.fecha), 3);
  assert.ok(armarMes([p], "2026-11", "2026-11-04").dias[4].publicaciones.some((x) => x.id === "j"));
  assert.ok(armarSemana([p], "2026-11-04", "2026-11-04").dias[3].publicaciones.some((x) => x.id === "j"));
});

test("recordatorios: programadas de hoy sin publicar, por hora", () => {
  const pubs = [
    pub("tarde", "2026-11-04", "19:00"),
    pub("hecha", "2026-11-04", "08:00", "publicado"),
    pub("borr", "2026-11-04", "09:00", "borrador"),
    pub("temprano", "2026-11-04", "10:30"),
    pub("manana", "2026-11-05", "10:00"),
  ];
  assert.deepEqual(recordatoriosDelDia(pubs, "2026-11-04").map((p) => p.id), ["temprano", "tarde"]);
  assert.equal(resumenDeEstados(pubs).texto, "Borrador: 1 · Programado: 3 · Publicado: 1");
});

test("fechas sin zona horaria", () => {
  assert.equal(fechaLocal(new Date(2026, 10, 4, 23, 30)), "2026-11-04");
  assert.equal(sumarDias("2026-02-28", 1), "2026-03-01");
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29");
  assert.equal(inicioDeSemana("2026-11-01"), "2026-10-26");
  assert.equal(esFechaValida("2026-02-30"), false);
  assert.equal(esFechaValida("2026-11-04"), true);
});
