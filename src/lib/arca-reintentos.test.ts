// Motor de facturación · política de reintentos (núcleo puro de arca-reintentos.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConfiguracionFiscalError,
  POLITICA_DE_REINTENTOS,
  clasificarFalla,
  despuesDeLaFalla,
  esperaAntesDelProximo,
} from "./arca-reintentos";
import { ArcaNoDisponibleError, ArcaPasajeroError, ArcaRechazoError, ComprobanteInvalidoError } from "@/plugins/arca";

test("la espera crece al doble por intento y se planta en el tope de una hora", () => {
  const minutos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => esperaAntesDelProximo(n) / 60);
  assert.deepEqual(minutos, [1, 2, 4, 8, 16, 32, 60, 60, 60]);
});

test("clasifica: rechazo, pasajero, ARCA no disponible, configuración y sistema", () => {
  assert.equal(clasificarFalla(new ArcaRechazoError("R", [])), "rechazo");
  assert.equal(clasificarFalla(new ComprobanteInvalidoError("x", [])), "rechazo");
  assert.equal(clasificarFalla(new ArcaPasajeroError("timeout")), "pasajero");
  // El interruptor abierto es un pasajero, pero NO cuenta como intento: se clasifica aparte.
  assert.equal(clasificarFalla(new ArcaNoDisponibleError("wswhomo.afip.gov.ar", new Date())), "arca_no_disponible");
  assert.equal(clasificarFalla(new ConfiguracionFiscalError("sin CUIT")), "configuracion");
  const credencialAusente = Object.assign(new Error("sin cert"), { name: "CredencialFiscalAusenteError" });
  assert.equal(clasificarFalla(credencialAusente), "configuracion");
  assert.equal(clasificarFalla(new Error("P2002")), "sistema");
  assert.equal(clasificarFalla("texto suelto"), "sistema");
});

test("un dato fiscal faltante detiene el envío de entrada: reintentar no lo arregla", () => {
  assert.deepEqual(despuesDeLaFalla("configuracion", 0), { esperaSeg: null, detener: true });
});

test("pasajero: espera creciente hasta el tope de intentos, y ahí se detiene", () => {
  assert.deepEqual(despuesDeLaFalla("pasajero", 0), { esperaSeg: 60, detener: false });
  assert.deepEqual(despuesDeLaFalla("pasajero", 3), { esperaSeg: 8 * 60, detener: false });
  const max = POLITICA_DE_REINTENTOS.maxIntentos;
  assert.deepEqual(despuesDeLaFalla("pasajero", max - 2), { esperaSeg: 60 * 60, detener: false });
  assert.deepEqual(despuesDeLaFalla("pasajero", max - 1), { esperaSeg: null, detener: true });
  assert.deepEqual(despuesDeLaFalla("sistema", max + 5), { esperaSeg: null, detener: true });
});

test("la política se puede inyectar (tests y ajustes por entorno)", () => {
  const corta = { esperaInicialSeg: 1, factor: 3, esperaTopeSeg: 5, maxIntentos: 3 };
  assert.deepEqual(despuesDeLaFalla("pasajero", 0, corta), { esperaSeg: 1, detener: false });
  assert.deepEqual(despuesDeLaFalla("pasajero", 1, corta), { esperaSeg: 3, detener: false });
  assert.deepEqual(despuesDeLaFalla("pasajero", 2, corta), { esperaSeg: null, detener: true });
});
