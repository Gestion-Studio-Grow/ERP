// Los estados vacíos de la agenda y el atajo "dar un turno": se EJECUTA la decisión con cada
// persona que llega a la pantalla y con fechas de verdad, pasadas, de hoy e inventadas.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esFechaDeCalendario,
  esIdDeFicha,
  hrefNuevoTurno,
  leerClienteDelAlta,
  leerNuevoTurno,
  vacioDiaSinTurnos,
  vacioManana,
  vacioSinProfesionales,
  vacioSinServicios,
} from "./pasos";

const HOY = "2026-09-24";

test("fecha de calendario: sólo YYYY-MM-DD que existe", () => {
  assert.equal(esFechaDeCalendario("2026-09-24"), true);
  assert.equal(esFechaDeCalendario("2028-02-29"), true);
  assert.equal(esFechaDeCalendario("2026-02-31"), false);
  assert.equal(esFechaDeCalendario("24/09/2026"), false);
  assert.equal(esFechaDeCalendario("2026-09-24T10:00"), false);
  assert.equal(esFechaDeCalendario(undefined), false);
});

test("el link del alta lleva la fecha sólo si es una fecha válida", () => {
  assert.equal(hrefNuevoTurno("2026-09-25"), "/admin/turnos/lista?nuevo=1&fecha=2026-09-25");
  assert.equal(hrefNuevoTurno(), "/admin/turnos/lista?nuevo=1");
  assert.equal(hrefNuevoTurno("mañana"), "/admin/turnos/lista?nuevo=1");
});

test("la lista abre el alta con la fecha de hoy o futura; la pasada o inventada no se precarga", () => {
  assert.deepEqual(leerNuevoTurno({ nuevo: "1", fecha: "2026-09-25" }, HOY), { abrir: true, fecha: "2026-09-25" });
  assert.deepEqual(leerNuevoTurno({ nuevo: "1", fecha: HOY }, HOY), { abrir: true, fecha: HOY });
  assert.deepEqual(leerNuevoTurno({ nuevo: "1", fecha: "2026-09-23" }, HOY), { abrir: true, fecha: "" });
  assert.deepEqual(leerNuevoTurno({ nuevo: "1", fecha: "2026-13-01" }, HOY), { abrir: true, fecha: "" });
  assert.deepEqual(leerNuevoTurno({ nuevo: ["1", "0"], fecha: ["2026-10-01"] }, HOY), { abrir: true, fecha: "2026-10-01" });
});

test("darle un turno desde la ficha: el link lleva a la clienta, con o sin fecha", () => {
  assert.equal(hrefNuevoTurno(null, "cm1abc_D-9"), "/admin/turnos/lista?nuevo=1&cliente=cm1abc_D-9");
  assert.equal(hrefNuevoTurno("2026-09-25", "cm1abc"), "/admin/turnos/lista?nuevo=1&fecha=2026-09-25&cliente=cm1abc");
  // Un id que rompería la URL o metería otro parámetro no viaja.
  assert.equal(hrefNuevoTurno(null, "a&nuevo=0"), "/admin/turnos/lista?nuevo=1");
  assert.equal(hrefNuevoTurno(null, ""), "/admin/turnos/lista?nuevo=1");
  assert.equal(esIdDeFicha("x".repeat(65)), false);
});

test("la lista precarga la clienta sólo con el alta abierta y un id sano", () => {
  assert.equal(leerClienteDelAlta({ nuevo: "1", cliente: "cm1abc" }), "cm1abc");
  assert.equal(leerClienteDelAlta({ nuevo: "1", cliente: ["cm1abc", "otra"] }), "cm1abc");
  assert.equal(leerClienteDelAlta({ cliente: "cm1abc" }), "");
  assert.equal(leerClienteDelAlta({ nuevo: "1", cliente: "<script>" }), "");
  assert.equal(leerClienteDelAlta({ nuevo: "1" }), "");
});

test("sin ?nuevo=1 la lista queda como siempre: el alta cerrada y sin fecha", () => {
  assert.deepEqual(leerNuevoTurno({}, HOY), { abrir: false, fecha: "" });
  assert.deepEqual(leerNuevoTurno({ fecha: "2026-09-25" }, HOY), { abrir: false, fecha: "" });
  assert.deepEqual(leerNuevoTurno({ nuevo: "si" }, HOY), { abrir: false, fecha: "" });
});

test("sin profesionales: al profesional se le dice a quién pedírselo, sin un botón que no puede usar", () => {
  const p = vacioSinProfesionales({ esProfesional: true, puedeCargarCatalogo: false });
  assert.equal(p.accion, null);
  assert.match(p.descripcion, /Pedile a quien administra el negocio/);
});

test("sin profesionales: quien puede abrir el Catálogo va a cargarlas", () => {
  const p = vacioSinProfesionales({ esProfesional: false, puedeCargarCatalogo: true });
  assert.deepEqual(p.accion, { href: "/admin/catalogo", etiqueta: "Cargar profesionales" });
});

test("sin profesionales: la recepción, que no abre el Catálogo, no recibe un link a 'App no disponible'", () => {
  const p = vacioSinProfesionales({ esProfesional: false, puedeCargarCatalogo: false });
  assert.equal(p.accion, null);
  assert.match(p.descripcion, /la dueña o el dueño/);
});

test("día vacío de hoy o futuro: 'Dar un turno' abre el alta con ese día puesto", () => {
  const hoy = vacioDiaSinTurnos({ fecha: HOY, hoy: HOY, puedeDarTurno: true });
  assert.equal(hoy.titulo, "Hoy no hay turnos");
  assert.deepEqual(hoy.accion, { href: `/admin/turnos/lista?nuevo=1&fecha=${HOY}`, etiqueta: "Dar un turno" });
  const futuro = vacioDiaSinTurnos({ fecha: "2026-10-02", hoy: HOY, puedeDarTurno: true });
  assert.equal(futuro.accion?.href, "/admin/turnos/lista?nuevo=1&fecha=2026-10-02");
});

test("día vacío pasado: no ofrece dar un turno en el pasado, lleva a hoy", () => {
  const p = vacioDiaSinTurnos({ fecha: "2026-09-01", hoy: HOY, puedeDarTurno: true });
  assert.deepEqual(p.accion, { href: "/admin/turnos", etiqueta: "Ir a hoy" });
});

test("día vacío para el profesional: no da turnos, no hay botón", () => {
  const p = vacioDiaSinTurnos({ fecha: HOY, hoy: HOY, puedeDarTurno: false });
  assert.equal(p.accion, null);
});

test("mañana sin turnos: el botón da un turno para mañana", () => {
  const p = vacioManana({ dia: "2026-09-25" });
  assert.equal(p.accion?.href, "/admin/turnos/lista?nuevo=1&fecha=2026-09-25");
});

test("recordatorios sin servicios: al Catálogo sólo quien lo abre", () => {
  assert.deepEqual(vacioSinServicios({ abreCatalogo: true }).accion, { href: "/admin/catalogo", etiqueta: "Cargar servicios" });
  const sin = vacioSinServicios({ abreCatalogo: false });
  assert.equal(sin.accion, null);
  assert.match(sin.descripcion, /la dueña o el dueño/);
});
