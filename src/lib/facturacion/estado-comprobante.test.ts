import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoDelComprobante, type HechosDelComprobante } from "./estado-comprobante";

const ahora = new Date("2026-11-06T12:00:00Z");
const despues = new Date("2026-11-06T12:05:00Z");
const antes = new Date("2026-11-06T11:55:00Z");
const envio = (p: Partial<NonNullable<HechosDelComprobante["envio"]>> = {}) => ({
  processedAt: null, attempts: 0, lastError: null, proximoIntentoEn: null, bloqueadoHasta: null, muertoEn: null, ...p,
});
const h = (p: Partial<HechosDelComprobante>): HechosDelComprobante => ({ status: "PENDING", rechazoMotivo: null, cae: null, envio: envio(), ...p });

test("los siete estados salen de lo que ya guarda el motor", () => {
  assert.equal(estadoDelComprobante(h({ status: "AUTHORIZED", cae: "1" }), ahora).estado, "AUTORIZADO");
  const arca = estadoDelComprobante(h({ status: "REJECTED", rechazoMotivo: "10015: El CUIT no es válido" }), ahora);
  assert.deepEqual([arca.estado, arca.final, arca.motivo], ["RECHAZADO", true, "El CUIT no es válido"]);
  const sistema = estadoDelComprobante(h({ status: "REJECTED", rechazoMotivo: "receptor.condicionIva: falta la condición" }), ahora);
  assert.deepEqual([sistema.estado, sistema.final, sistema.motivo], ["PENDIENTE_DATOS", false, "falta la condición"]);
  assert.equal(estadoDelComprobante(h({ envio: null }), ahora).estado, "EN_COLA");
  assert.equal(estadoDelComprobante(h({}), ahora).estado, "EN_COLA");
  assert.equal(estadoDelComprobante(h({ envio: envio({ bloqueadoHasta: despues }) }), ahora).estado, "EMITIENDO");
  // Un lock vencido (el worker murió) ya no es «emitiendo».
  assert.equal(estadoDelComprobante(h({ envio: envio({ bloqueadoHasta: antes }) }), ahora).estado, "EN_COLA");
  const transitoria = estadoDelComprobante(h({ envio: envio({ attempts: 2, lastError: "600: token", proximoIntentoEn: despues }) }), ahora);
  assert.deepEqual([transitoria.estado, transitoria.reintentaEn], ["FALLA_TRANSITORIA", despues]);
  assert.equal(estadoDelComprobante(h({ envio: envio({ attempts: 1, muertoEn: antes, lastError: "Falta el certificado" }) }), ahora).estado, "PENDIENTE_DATOS");
  assert.equal(estadoDelComprobante(h({ envio: envio({ attempts: 8, muertoEn: antes }) }), ahora).estado, "PENDIENTE_REVISION");
});

test("un autorizado es final aunque el envío diga otra cosa", () => {
  const r = estadoDelComprobante(h({ status: "AUTHORIZED", cae: "1", envio: envio({ attempts: 8, muertoEn: antes }) }), ahora);
  assert.deepEqual([r.estado, r.final, r.reintentaEn], ["AUTORIZADO", true, null]);
});

test("v1.1: el tope por defecto es el de la política de reintentos (fuente única)", async () => {
  const { POLITICA_DE_REINTENTOS } = await import("@/lib/arca-reintentos");
  const { VERSION_CONTRATO_ESTADOS } = await import("./estado-comprobante");
  assert.equal(VERSION_CONTRATO_ESTADOS, 1.1);
  assert.equal(POLITICA_DE_REINTENTOS.maxIntentos, 4);
  const tope = POLITICA_DE_REINTENTOS.maxIntentos;
  // Agotado (≥ tope, pasadas las 24 h) → revisión; detenido antes del tope → falta un dato.
  assert.equal(estadoDelComprobante(h({ envio: envio({ attempts: tope, muertoEn: antes }) }), ahora).estado, "PENDIENTE_REVISION");
  assert.equal(estadoDelComprobante(h({ envio: envio({ attempts: tope - 1, muertoEn: antes }) }), ahora).estado, "PENDIENTE_DATOS");
});
