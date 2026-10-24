// Lo puro de Hoy, Semana y Agendar (Tanda 3A).

import { test } from "node:test";
import assert from "node:assert/strict";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { altoTeclado, diasDeCinta, direccionDeslizar, esUrgente, faltaPara, hrefAgendar, lineaDelDia, puntitos, rangoDeSemana } from "./_agenda-core";

const iso = (f: string, h: string) => businessWallTimeToUtc(f, h).toISOString();

test("la cinta: Hoy, Mañana y después el día corto, 14 días", () => {
  const d = diasDeCinta("2026-10-23");
  assert.equal(d.length, 14);
  assert.deepEqual(d.slice(0, 3).map((x) => x.etiqueta), ["Hoy", "Mañana", "dom 25"]);
  assert.equal(d[13].fecha, "2026-11-05");
});

test("M-056: el hueco abre Agendar con día y hora puestos", () => {
  assert.equal(hrefAgendar({ fecha: "2026-10-23", hora: "18:00" }), "/admin/clases/agendar?fecha=2026-10-23&hora=18%3A00");
  assert.equal(hrefAgendar(), "/admin/clases/agendar");
});

test("M-056: la línea del jueves con clases a las 17 y 19 y horario 16–21 muestra los huecos en orden", () => {
  const f = "2026-10-23";
  const clases = [
    { id: "b", empiezaEn: new Date(iso(f, "19:00")) },
    { id: "a", empiezaEn: new Date(iso(f, "17:00")) },
  ];
  const huecos = [iso(f, "20:00"), iso(f, "16:00"), iso(f, "18:00")];
  const l = lineaDelDia({ fecha: f, clases, huecos, bloqueos: [{ id: "x", desde: "21:00", hasta: "22:00" }] });
  assert.deepEqual(
    l.map((i) => (i.tipo === "bloqueo" ? `bloqueo ${i.desde}` : `${i.tipo} ${i.hora}`)),
    ["hueco 16:00", "clase 17:00", "hueco 18:00", "clase 19:00", "hueco 20:00", "bloqueo 21:00"],
  );
});

test("un bloqueo de día entero va primero", () => {
  const l = lineaDelDia({ fecha: "2026-10-23", clases: [{ id: "a", empiezaEn: iso("2026-10-23", "08:00") }], huecos: [], bloqueos: [{ id: "x", desde: "00:00", hasta: "23:59" }] });
  assert.equal(l[0].tipo, "bloqueo");
  assert.equal(l[0].tipo === "bloqueo" && l[0].todoElDia, true);
});

test("M-063: el pedido que empieza en menos de 3 h es urgente; el que ya empezó o falta más, no", () => {
  const ahora = new Date("2026-10-23T18:00:00.000Z");
  assert.equal(esUrgente(new Date("2026-10-23T20:00:00.000Z"), ahora), true);
  assert.equal(esUrgente(new Date("2026-10-23T21:00:00.000Z"), ahora), true);
  assert.equal(esUrgente(new Date("2026-10-23T21:01:00.000Z"), ahora), false);
  assert.equal(esUrgente(new Date("2026-10-23T17:59:00.000Z"), ahora), false);
  assert.equal(faltaPara(new Date("2026-10-23T20:00:00.000Z"), ahora), "en 2 h");
  assert.equal(faltaPara(new Date("2026-10-23T18:40:00.000Z"), ahora), "en 40 min");
  assert.equal(faltaPara(new Date("2026-10-23T19:30:00.000Z"), ahora), "en 1 h 30");
});

test("el rótulo de la semana, en el mes y cruzando de mes", () => {
  assert.equal(rangoDeSemana("2026-10-19"), "19 – 25 oct");
  assert.equal(rangoDeSemana("2026-10-26"), "26 oct – 1 nov");
});

test("los puntitos de carga: como mucho tres", () => {
  assert.deepEqual([0, 1, 2, 3, 7].map(puntitos), [0, 1, 2, 3, 3]);
});

test("M-057: deslizar de costado cambia de semana; lo vertical es scroll", () => {
  assert.equal(direccionDeslizar(-90, 10), "siguiente");
  assert.equal(direccionDeslizar(90, -10), "anterior");
  assert.equal(direccionDeslizar(40, 0), null, "muy corto");
  assert.equal(direccionDeslizar(-90, 60), null, "más vertical que horizontal");
  assert.equal(direccionDeslizar(Number.NaN, 0), null);
});

test("M-069: el alto del teclado; las barras del navegador no cuentan", () => {
  assert.equal(altoTeclado(800, 480), 320);
  assert.equal(altoTeclado(800, 480, 20), 300);
  assert.equal(altoTeclado(800, 760), 0);
  assert.equal(altoTeclado(800, 800), 0);
});

test("los rótulos de día: «vie 23/10» y «viernes 23»", async () => {
  const { diaConMes, diaLargo } = await import("./_agenda-core");
  assert.equal(diaConMes("2026-10-23"), "vie 23/10");
  assert.equal(diaLargo("2026-10-23"), "viernes 23");
  assert.equal(diaLargo("2026-11-01"), "domingo 1");
});
