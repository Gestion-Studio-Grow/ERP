import { test } from "node:test";
import assert from "node:assert/strict";
import { textoDeEsperaDelServidor } from "./espera-del-servidor";

// 20:14:10 en Buenos Aires (UTC-3).
const AHORA = new Date("2026-11-14T23:14:10Z");

test("espera del servidor: dice hasta qué hora (la del club), redondeada al minuto siguiente", () => {
  assert.equal(textoDeEsperaDelServidor(30, AHORA), "Demasiados intentos: esperá hasta las 20:15 y probá de nuevo.");
  assert.equal(textoDeEsperaDelServidor(120, AHORA), "Demasiados intentos: esperá hasta las 20:17 y probá de nuevo.");
  assert.equal(textoDeEsperaDelServidor(600, AHORA), "Demasiados intentos: esperá hasta las 20:25 y probá de nuevo.");
});

test("espera del servidor: nunca antes de que termine la espera, ni con un número raro", () => {
  // Justo en el minuto: no redondea para atrás.
  assert.equal(textoDeEsperaDelServidor(50, AHORA), "Demasiados intentos: esperá hasta las 20:15 y probá de nuevo.");
  assert.equal(textoDeEsperaDelServidor(51, AHORA), "Demasiados intentos: esperá hasta las 20:16 y probá de nuevo.");
  assert.match(textoDeEsperaDelServidor(Number.NaN, AHORA), /hasta las 20:16/);
  assert.match(textoDeEsperaDelServidor(0, AHORA), /hasta las 20:15/);
});

test("espera del servidor: no repite segundos que después quedan viejos", () => {
  assert.doesNotMatch(textoDeEsperaDelServidor(30, AHORA), /segundos|minutos/);
});
