// Tests del descriptor del módulo BANCOS: pasa la validación del contrato
// (ADR-054/055) y el manifiesto legado se deriva bien.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validarDescriptor } from "@/modules/contract";
import { bancosManifest, bancosModule } from "./module";

test("el descriptor de bancos pasa la validación del catálogo sin errores", () => {
  const problemas = validarDescriptor(bancosModule);
  assert.deepEqual(
    problemas.filter((p) => p.severidad === "error"),
    [],
  );
});

test("declara su superficie: comando CreateInvoice, sin eventos del outbox", () => {
  assert.equal(bancosModule.kind, "plugin");
  assert.deepEqual(bancosModule.llamaComandos, ["CreateInvoice"]);
  assert.deepEqual(bancosModule.consumeEventos, []);
});

test("la config no declara secretos (el extracto lo sube el usuario, no hay credenciales)", () => {
  const campos = Object.values(bancosModule.configSchema ?? {});
  assert.ok(campos.length > 0);
  assert.ok(campos.every((c) => c.secreto !== true));
});

test("domicilioEmisor y puntoVenta son obligatorios para activar", () => {
  assert.equal(bancosModule.configSchema?.domicilioEmisor.requerido, true);
  assert.equal(bancosModule.configSchema?.puntoVenta.requerido, true);
});

test("el manifiesto legado se deriva del descriptor", () => {
  assert.equal(bancosManifest.key, "bancos");
  assert.deepEqual(bancosManifest.llamaComandos, ["CreateInvoice"]);
  assert.ok(bancosManifest.configSchema.umbralIdentificacion);
});
