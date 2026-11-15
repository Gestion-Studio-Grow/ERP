// «Aparecer en el buscador de profes»: la clave reservada `_directorio` del JSON de plantillas.
// Parseo fail-closed, validación de lo que llega de la pantalla, y que los textos la ignoren y no la borren.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLAVES_PLANTILLA } from "./core";
import { MARCA_BIENVENIDA, bienvenidaVista, esClaveReservada, plantillasConBienvenida, plantillasConCambio, reservadasDe } from "./config-campos";
import { CLAVE_DIRECTORIO, DIRECTORIO_DEFAULT, leerDirectorio, limpiarZona, plantillasConDirectorio, validarDirectorio } from "./directorio";

const SI = { visible: true, zona: "Canning" };

test("leerDirectorio: sin clave, JSON roto o tipos raros → NO visible (fail-closed)", () => {
  assert.deepEqual(leerDirectorio(null), DIRECTORIO_DEFAULT);
  assert.deepEqual(leerDirectorio("x"), DIRECTORIO_DEFAULT);
  assert.deepEqual(leerDirectorio([]), DIRECTORIO_DEFAULT);
  assert.deepEqual(leerDirectorio({ recordatorio: "Hola" }), DIRECTORIO_DEFAULT);
  assert.equal(leerDirectorio({ [CLAVE_DIRECTORIO]: { visible: "true", zona: "Canning" } }).visible, false);
  assert.equal(leerDirectorio({ [CLAVE_DIRECTORIO]: { visible: 1, zona: "Canning" } }).visible, false);
  assert.equal(leerDirectorio({ [CLAVE_DIRECTORIO]: { visible: true, zona: "" } }).visible, false);
  // Claves de más (por ejemplo el «contesta» que se sacó el 13/11): no se reconoce → NO visible.
  assert.equal(leerDirectorio({ [CLAVE_DIRECTORIO]: { visible: true, zona: "Canning", contesta: "gsg" } }).visible, false);
  assert.equal(DIRECTORIO_DEFAULT.visible, false);
});

test("leerDirectorio: el guardado bueno se lee tal cual", () => {
  assert.deepEqual(leerDirectorio({ [CLAVE_DIRECTORIO]: SI }), SI);
  assert.deepEqual(leerDirectorio({ [CLAVE_DIRECTORIO]: { visible: false, zona: "" } }), { visible: false, zona: "" });
});

test("validarDirectorio: sólo las dos claves, con su tipo; zona obligatoria para aparecer", () => {
  assert.deepEqual(validarDirectorio(SI), { ok: true, v: SI });
  assert.equal(validarDirectorio({ ...SI, tenantId: "otro" }).ok, false);
  assert.equal(validarDirectorio({ ...SI, contesta: "gsg" }).ok, false);
  assert.equal(validarDirectorio({ ...SI, visible: "si" }).ok, false);
  assert.equal(validarDirectorio({ ...SI, zona: 3 }).ok, false);
  assert.equal(validarDirectorio({ ...SI, zona: "x".repeat(41) }).ok, false);
  assert.equal(validarDirectorio({ ...SI, zona: "   " }).ok, false);
  assert.deepEqual(validarDirectorio({ visible: false }), { ok: true, v: { visible: false, zona: "" } });
  assert.equal(validarDirectorio(null).ok, false);
});

test("limpiarZona: espacios colapsados y sin signos raros", () => {
  assert.equal(limpiarZona("  Canning   centro "), "Canning centro");
  assert.equal(limpiarZona("<b>Cañuelas</b>"), "b Cañuelas b");
  assert.equal(limpiarZona(5), "");
});

test("los textos ignoran las claves «_»: ningún texto de WhatsApp empieza con «_»", () => {
  assert.equal(CLAVES_PLANTILLA.some((k) => esClaveReservada(k)), false);
  assert.equal(esClaveReservada(CLAVE_DIRECTORIO), true);
  assert.equal(esClaveReservada(MARCA_BIENVENIDA), true);
});

test("editar un texto o marcar la Bienvenida NO borra el directorio", () => {
  const guardadas = { recordatorio: "Hola {nombre}", [CLAVE_DIRECTORIO]: SI, basura: 3 };
  const tras = plantillasConCambio(guardadas, "confirmada", "Confirmada!");
  assert.deepEqual(leerDirectorio(tras), SI);
  assert.equal(tras.confirmada, "Confirmada!");
  assert.equal("basura" in tras, false);
  const restaurado = plantillasConCambio(tras, "recordatorio", null);
  assert.deepEqual(leerDirectorio(restaurado), SI);
  const conB = plantillasConBienvenida(guardadas);
  assert.deepEqual(leerDirectorio(conB), SI);
  assert.equal(bienvenidaVista(conB), true);
});

test("guardar el directorio NO toca los textos ni la marca de la Bienvenida", () => {
  const guardadas = { recordatorio: "Hola {nombre}", [MARCA_BIENVENIDA]: "1", basura: 3 };
  const out = plantillasConDirectorio(guardadas, SI);
  assert.equal(out.recordatorio, "Hola {nombre}");
  assert.equal(bienvenidaVista(out), true);
  assert.deepEqual(leerDirectorio(out), SI);
  assert.equal("basura" in out, false);
  assert.deepEqual(reservadasDe(out), { [MARCA_BIENVENIDA]: "1", [CLAVE_DIRECTORIO]: SI });
});

test("el editor de textos y el notificador leen sólo CLAVES_PLANTILLA (nunca el JSON crudo)", () => {
  const textos = readFileSync(new URL("../../app/admin/(dashboard)/clases/config/textos/page.tsx", import.meta.url), "utf8");
  assert.match(textos, /CLAVES_PLANTILLA\.filter/);
  assert.doesNotMatch(textos, /Object\.(keys|entries|values)\(/);
  const notificador = readFileSync(new URL("./notificador.ts", import.meta.url), "utf8");
  assert.doesNotMatch(notificador, /plantillas/);
  const datos = readFileSync(new URL("./datos.server.ts", import.meta.url), "utf8");
  // configPadel arma `plantillas` recorriendo CLAVES_PLANTILLA: una clave «_» no llega a ningún texto.
  assert.match(datos, /for \(const k of CLAVES_PLANTILLA\)/);
});
