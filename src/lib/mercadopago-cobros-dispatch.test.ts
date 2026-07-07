// Tests del glue de COBROS de Mercado Pago: modo por env (stub/test/real),
// heurística de token de prueba, y qué adapter arma cada modo. Sin red.
import test from "node:test";
import assert from "node:assert/strict";
import {
  modoCobrosDesdeEnv,
  pareceTokenDePrueba,
  crearPasarelaCobrosPara,
} from "./mercadopago-cobros-dispatch";
import { StubPasarelaCobros, HttpPasarelaCobros } from "@/plugins/mercadopago/cobros";

test("modoCobrosDesdeEnv: default stub, test y real por MP_MODO", () => {
  assert.equal(modoCobrosDesdeEnv({}), "stub");
  assert.equal(modoCobrosDesdeEnv({ MP_MODO: "test" }), "test");
  assert.equal(modoCobrosDesdeEnv({ MP_MODO: "real" }), "real");
  assert.equal(modoCobrosDesdeEnv({ MP_MODO: "REAL" }), "real");
  assert.equal(modoCobrosDesdeEnv({ MP_MODO: "yolo" }), "stub");
});

test("pareceTokenDePrueba: detecta el prefijo TEST- de Mercado Pago", () => {
  assert.equal(pareceTokenDePrueba("TEST-1234-abcd"), true);
  assert.equal(pareceTokenDePrueba("test-1234-abcd"), true);
  assert.equal(pareceTokenDePrueba("APP_USR-1234-abcd"), false);
  assert.equal(pareceTokenDePrueba(""), false);
});

test("crearPasarelaCobrosPara: sin MP_MODO → StubPasarelaCobros", () => {
  assert.ok(crearPasarelaCobrosPara("t1", {}) instanceof StubPasarelaCobros);
});

test("crearPasarelaCobrosPara: MP_MODO=test → HttpPasarelaCobros (aunque falte el token)", () => {
  assert.ok(crearPasarelaCobrosPara("t1", { MP_MODO: "test" }) instanceof HttpPasarelaCobros);
  assert.ok(
    crearPasarelaCobrosPara("t1", { MP_MODO: "test", MP_ACCESS_TOKEN: "TEST-abc" }) instanceof
      HttpPasarelaCobros,
  );
});

test("crearPasarelaCobrosPara: MP_MODO=real → HttpPasarelaCobros", () => {
  assert.ok(
    crearPasarelaCobrosPara("t1", { MP_MODO: "real", MP_ACCESS_TOKEN: "APP_USR-abc" }) instanceof
      HttpPasarelaCobros,
  );
});
