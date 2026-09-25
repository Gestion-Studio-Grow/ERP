// La lista de clientes del diseño nuevo: se EJECUTA con fichas de una estética de verdad (nombres
// y teléfonos inventados del laboratorio) y con URLs sanas, rotas y maliciosas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TAMANIO_PAGINA, coincide, leerParametrosLista, ordenarClientes, paginaDeClientes, ultimaVez } from "./lista-core";
import type { FilaCliente } from "./ClientesLista";

const f = (id: string, nombre: string, telefono: string, extra: Partial<FilaCliente> = {}): FilaCliente => ({
  id,
  nombre,
  telefono,
  segmento: "frecuente",
  diasSinVenir: 10,
  proximoTurno: null,
  visitas: 3,
  ...extra,
});

const FICHAS: FilaCliente[] = [
  f("a", "Abril Godoy", "11 5555-2036", { diasSinVenir: 3, visitas: 8 }),
  f("b", "Belén Ríos", "11 5555-1001", { diasSinVenir: 70, segmento: "en-riesgo", visitas: 5 }),
  f("c", "Camila Álvarez", "11 5555-3300", { diasSinVenir: null, segmento: "sin-visitas", visitas: 0, proximoTurno: "2026-09-30T13:00:00.000Z" }),
  f("d", "Daniela Paz", "11 5555-4400", { diasSinVenir: 200, segmento: "perdida", visitas: 2, proximoTurno: "2026-09-26T12:00:00.000Z" }),
];

test("la URL se lee con cuidado: situación y orden que no existen no filtran ni ordenan", () => {
  assert.deepEqual(leerParametrosLista({}), { q: "", situacion: null, orden: null, pagina: 1 });
  assert.deepEqual(leerParametrosLista({ q: "  abril ", situacion: "en-riesgo", orden: "-visitas", cursor: "3" }), {
    q: "abril",
    situacion: "en-riesgo",
    orden: { key: "visitas", direction: "desc" },
    pagina: 3,
  });
  const raro = leerParametrosLista({ situacion: "vip", orden: "deuda", cursor: "-2" });
  assert.equal(raro.situacion, null);
  assert.equal(raro.orden, null);
  assert.equal(raro.pagina, 1);
  assert.equal(leerParametrosLista({ q: "x".repeat(500) }).q.length, 80);
});

test("buscar por nombre sin tildes ni mayúsculas, o por teléfono de corrido", () => {
  assert.equal(coincide(FICHAS[2], "alvarez"), true);
  assert.equal(coincide(FICHAS[1], "BELEN"), true);
  assert.equal(coincide(FICHAS[0], "1155552036"), true);
  assert.equal(coincide(FICHAS[0], "5555-2036"), true);
  assert.equal(coincide(FICHAS[0], "paz"), false);
  assert.equal(coincide(FICHAS[0], "   "), true);
});

test("sin orden elegido: las que vinieron hace poco primero; quien nunca vino, al final", () => {
  assert.deepEqual(ordenarClientes(FICHAS, null).map((x) => x.id), ["a", "b", "d", "c"]);
  assert.deepEqual(ordenarClientes(FICHAS, { key: "ultima", direction: "desc" }).map((x) => x.id), ["c", "d", "b", "a"]);
});

test("ordenar por nombre, visitas y próximo turno (sin turno siempre al final)", () => {
  assert.deepEqual(ordenarClientes(FICHAS, { key: "nombre", direction: "asc" }).map((x) => x.id), ["a", "b", "c", "d"]);
  assert.deepEqual(ordenarClientes(FICHAS, { key: "visitas", direction: "desc" }).map((x) => x.id), ["a", "b", "d", "c"]);
  assert.deepEqual(ordenarClientes(FICHAS, { key: "proximo", direction: "asc" }).map((x) => x.id), ["d", "c", "a", "b"]);
  assert.deepEqual(ordenarClientes(FICHAS, { key: "proximo", direction: "desc" }).map((x) => x.id), ["c", "d", "a", "b"]);
});

test("la situación filtra y los números de los filtros cuentan con la búsqueda puesta", () => {
  const p = paginaDeClientes(FICHAS, { q: "", situacion: "perdida", orden: null, pagina: 1 });
  assert.deepEqual(p.filas.map((x) => x.id), ["d"]);
  assert.equal(p.coinciden, 1);
  assert.equal(p.porSituacion.frecuente, 1);
  assert.equal(p.porSituacion["en-riesgo"], 1);
  const buscando = paginaDeClientes(FICHAS, { q: "a", situacion: null, orden: null, pagina: 1 });
  assert.equal(buscando.coinciden, 3); // Belén Ríos no tiene «a»
  assert.equal(buscando.porSituacion["en-riesgo"], 0);
});

test("al navegador llega una página; una página que no existe muestra la última", () => {
  const muchas = Array.from({ length: 120 }, (_, i) => f(`id${i}`, `Clienta ${String(i).padStart(3, "0")}`, `11 5555-${String(i).padStart(4, "0")}`));
  const p1 = paginaDeClientes(muchas, { q: "", situacion: null, orden: { key: "nombre", direction: "asc" }, pagina: 1 });
  assert.equal(p1.filas.length, TAMANIO_PAGINA);
  assert.equal(p1.paginas, 3);
  const p9 = paginaDeClientes(muchas, { q: "", situacion: null, orden: { key: "nombre", direction: "asc" }, pagina: 9 });
  assert.equal(p9.pagina, 3);
  assert.equal(p9.filas.length, 20);
  assert.equal(p9.filas[0].nombre, "Clienta 100");
  const vacia = paginaDeClientes([], { q: "", situacion: null, orden: null, pagina: 1 });
  assert.equal(vacia.paginas, 1);
  assert.equal(vacia.filas.length, 0);
});

test("la última vez se dice en palabras, sin «ciclos»", () => {
  assert.equal(ultimaVez(null, "visita"), "Nunca vino");
  assert.equal(ultimaVez(null, "compra"), "Nunca compró");
  assert.equal(ultimaVez(0, "visita"), "Hoy");
  assert.equal(ultimaVez(1, "visita"), "Ayer");
  assert.equal(ultimaVez(12, "visita"), "Hace 12 días");
  assert.equal(ultimaVez(95, "visita"), "Hace 3 meses");
  assert.equal(ultimaVez(400, "visita"), "Hace más de un año");
  assert.equal(ultimaVez(800, "visita"), "Hace 2 años");
});
