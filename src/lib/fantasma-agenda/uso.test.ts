import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVISOS,
  MAX_MENSAJES_POR_CHARLA,
  TOPE_CHARLAS_MES,
  VENTANA_CHARLA_MS,
  decidirAtencion,
  topeCharlasMes,
  type EntradaAtencion,
} from "./uso";

const AHORA = new Date("2026-11-04T15:00:00.000Z");
const HACE_UNA_HORA = new Date(AHORA.getTime() - 3_600_000);

function entrada(over: Partial<EntradaAtencion> = {}): EntradaAtencion {
  return { prendido: true, charlasDelMes: 0, mensajesEnCharla: 0, ultimoMensaje: null, ahora: AHORA, ...over };
}

test("apagado: silencio, sin aviso", () => {
  const d = decidirAtencion(entrada({ prendido: false }));
  assert.deepEqual(d, { atender: false, motivo: "apagado" });
});

test("normal: primer mensaje abre charla; dentro de las 24 h sigue la misma", () => {
  assert.deepEqual(decidirAtencion(entrada()), { atender: true, charlaNueva: true });
  assert.deepEqual(decidirAtencion(entrada({ ultimoMensaje: HACE_UNA_HORA, mensajesEnCharla: 3 })), {
    atender: true,
    charlaNueva: false,
  });
  const viejo = new Date(AHORA.getTime() - VENTANA_CHARLA_MS - 1);
  assert.deepEqual(decidirAtencion(entrada({ ultimoMensaje: viejo, mensajesEnCharla: 50 })), {
    atender: true,
    charlaNueva: true,
  });
});

test("tope: charla nueva pasado el tope avisa una vez y después silencio", () => {
  const primera = decidirAtencion(entrada({ charlasDelMes: TOPE_CHARLAS_MES }));
  assert.deepEqual(primera, { atender: false, motivo: "tope", aviso: AVISOS.tope });
  const segunda = decidirAtencion(
    entrada({ charlasDelMes: TOPE_CHARLAS_MES, ultimoMensaje: HACE_UNA_HORA, yaAvisado: "tope" }),
  );
  assert.deepEqual(segunda, { atender: false, motivo: "tope" });
  // mes nuevo (el conteo bajó): arranca una charla nueva aunque esté en la ventana
  const mesNuevo = decidirAtencion(entrada({ charlasDelMes: 0, ultimoMensaje: HACE_UNA_HORA, yaAvisado: "tope" }));
  assert.deepEqual(mesNuevo, { atender: true, charlaNueva: true });
});

test("tope: una charla ya abierta sigue aunque el mes llegue al tope", () => {
  const d = decidirAtencion(entrada({ charlasDelMes: TOPE_CHARLAS_MES, ultimoMensaje: HACE_UNA_HORA, mensajesEnCharla: 2 }));
  assert.deepEqual(d, { atender: true, charlaNueva: false });
});

test("charla larga: avisa una vez y después silencio", () => {
  const base = { ultimoMensaje: HACE_UNA_HORA, mensajesEnCharla: MAX_MENSAJES_POR_CHARLA };
  assert.deepEqual(decidirAtencion(entrada(base)), { atender: false, motivo: "charla-larga", aviso: AVISOS["charla-larga"] });
  assert.deepEqual(decidirAtencion(entrada({ ...base, yaAvisado: "charla-larga" })), { atender: false, motivo: "charla-larga" });
});

test("tope por entorno: entero positivo o 300", () => {
  assert.equal(topeCharlasMes({ FANTASMA_TOPE_CHARLAS_MES: "5" }), 5);
  assert.equal(topeCharlasMes({ FANTASMA_TOPE_CHARLAS_MES: "abc" }), 300);
  assert.equal(topeCharlasMes({ FANTASMA_TOPE_CHARLAS_MES: "-1" }), 300);
  assert.equal(topeCharlasMes({}), 300);
});
