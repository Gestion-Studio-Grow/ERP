// B8: «Todos los turnos» carga 90 días con «Ver más atrás» (?desde=), y el renglón de los pasados.
import { test } from "node:test";
import assert from "node:assert/strict";
import { correrDias, diaCorto, DIAS_DE_LA_LISTA, textoSinCerrar, ventanaDeLista } from "./lista-core";

const HOY = "2026-10-22";

test("sin ?desde=: los últimos 90 días (no 365), cubriendo el primer día entero", () => {
  const v = ventanaDeLista(undefined, HOY);
  assert.equal(DIAS_DE_LA_LISTA, 90);
  assert.equal(v.desde, "2026-07-24");
  assert.equal(v.dias, 91);
  assert.equal(v.masAtras, "2026-04-25");
});

test("«Ver más atrás» suma de a 90 días", () => {
  const v = ventanaDeLista("2026-04-25", HOY);
  assert.equal(v.desde, "2026-04-25");
  assert.equal(v.dias, 181);
  assert.equal(v.masAtras, correrDias("2026-04-25", -90));
  // Como arreglo (?desde=a&desde=b), vale el primero.
  assert.equal(ventanaDeLista(["2026-04-25", "2020-01-01"], HOY).desde, "2026-04-25");
});

test("un ?desde= raro no rompe: inventado, futuro, más corto que 90 días o fuera del techo → lo de siempre", () => {
  const defecto = ventanaDeLista(undefined, HOY);
  for (const raro of ["", "ayer", "2026-02-31", "2026-12-01", "2026-10-01", "1990-01-01", "2026-4-1"]) {
    assert.deepEqual(ventanaDeLista(raro, HOY), defecto, raro);
  }
});

test("en el techo de 5 años ya no se ofrece «Ver más atrás»", () => {
  const techo = correrDias(HOY, -5 * 365);
  const v = ventanaDeLista(techo, HOY);
  assert.equal(v.desde, techo);
  assert.equal(v.masAtras, null);
  // A menos de 90 días del techo, el siguiente paso se queda en el techo.
  assert.equal(ventanaDeLista(correrDias(techo, 30), HOY).masAtras, techo);
});

test("la fecha del corte se escribe del texto, sin correrse un día por la zona", () => {
  assert.equal(diaCorto("2026-07-24"), "24/07/2026");
});

test("el renglón de los pasados sin cerrar", () => {
  assert.equal(textoSinCerrar(1), "1 pasado sin cerrar");
  assert.equal(textoSinCerrar(15), "15 pasados sin cerrar");
});
