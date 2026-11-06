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

const HORA = 60 * 60 * 1000;
const creadoEn = new Date("2026-11-06T12:00:00Z");
const aLas = (horas: number) => ({ creadoEn, ahora: new Date(creadoEn.getTime() + horas * HORA) });

test("escalera: 1, 5, 15 y 60 minutos, y después 60 fijos", () => {
  const minutos = [1, 2, 3, 4, 5, 6].map((n) => esperaAntesDelProximo(n) / 60);
  assert.deepEqual(minutos, [1, 5, 15, 60, 60, 60]);
  assert.equal(POLITICA_DE_REINTENTOS.maxIntentos, 4);
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
  assert.deepEqual(despuesDeLaFalla("configuracion", 0, aLas(0)), { esperaSeg: null, detener: true });
});

test("pasajero: cada falla espera su peldaño (1/5/15/60/60 min)", () => {
  const esperas = [0, 1, 2, 3, 4].map((previos) => despuesDeLaFalla("pasajero", previos, aLas(1)).esperaSeg! / 60);
  assert.deepEqual(esperas, [1, 5, 15, 60, 60]);
});

test("a las 23 h no se detiene aunque lleve 30 intentos: la ventana de 24 h no pasó", () => {
  assert.deepEqual(despuesDeLaFalla("pasajero", 29, aLas(23)), { esperaSeg: 60 * 60, detener: false });
});

test("a las 25 h con 3 intentos no se detiene: no recorrió la escalera", () => {
  assert.deepEqual(despuesDeLaFalla("pasajero", 2, aLas(25)), { esperaSeg: 15 * 60, detener: false });
});

test("a las 25 h con 4 intentos se detiene (también por falla del sistema)", () => {
  assert.deepEqual(despuesDeLaFalla("pasajero", 3, aLas(25)), { esperaSeg: null, detener: true });
  assert.deepEqual(despuesDeLaFalla("sistema", 3, aLas(25)), { esperaSeg: null, detener: true });
  assert.deepEqual(despuesDeLaFalla("pasajero", 3, aLas(24)), { esperaSeg: null, detener: true }, "justo en el borde");
});

test("la política se puede inyectar (tests y ajustes por entorno)", () => {
  const corta = { escaleraSeg: [1, 3], maxIntentos: 3, ventanaSeg: 0 };
  assert.deepEqual(despuesDeLaFalla("pasajero", 0, aLas(0), corta), { esperaSeg: 1, detener: false });
  assert.deepEqual(despuesDeLaFalla("pasajero", 1, aLas(0), corta), { esperaSeg: 3, detener: false });
  assert.deepEqual(despuesDeLaFalla("pasajero", 2, aLas(0), corta), { esperaSeg: null, detener: true });
});
