// Tests del glue de COBROS de Mercado Pago: modo por env (stub/test/real),
// heurística de token de prueba, y qué adapter arma cada modo. Sin red.
import test from "node:test";
import assert from "node:assert/strict";
import {
  modoCobrosDesdeEnv,
  pareceTokenDePrueba,
  crearPasarelaCobrosPara,
} from "./mercadopago-cobros-dispatch";
import { StubPasarelaCobros, HttpPasarelaCobros, type PasarelaCobros } from "@/plugins/mercadopago/cobros";
import { CobrosSinConexionError, configCobrosDesde, type DepsConfigCobros } from "@/lib/pagos-dispatch";

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

/**
 * Puerto de config de cobros sin base: `conexiones` = negocio → access_token de SU conexión.
 * El flag de legado se lee del `env` recibido, igual que en producción.
 */
function puerto(env: Record<string, string | undefined>, conexiones: Record<string, string> = {}, auditados: string[] = []) {
  const deps: DepsConfigCobros = {
    env,
    conexionMP: async (t) => (conexiones[t] ? { conexionId: `cx-${t}` } : null),
    tokenDe: async (t) => conexiones[t] ?? null,
    auditarLegado: async (t) => {
      auditados.push(t);
    },
  };
  return configCobrosDesde(deps);
}
const tokenDe = (p: PasarelaCobros) => (p as unknown as { token: () => Promise<string> }).token();

test("crearPasarelaCobrosPara: sin MP_MODO → StubPasarelaCobros (no cobra en ninguna cuenta)", async () => {
  assert.ok((await crearPasarelaCobrosPara("t1", {}, puerto({}))) instanceof StubPasarelaCobros);
});

test("crearPasarelaCobrosPara: MP_MODO=test con conexión → HttpPasarelaCobros con el token de la conexión", async () => {
  const env = { MP_MODO: "test", MP_ACCESS_TOKEN: "TEST-global" };
  const p = await crearPasarelaCobrosPara("t1", env, puerto(env, { t1: "TEST-de-t1" }));
  assert.ok(p instanceof HttpPasarelaCobros);
  assert.equal(await tokenDe(p), "TEST-de-t1");
});

test("crearPasarelaCobrosPara: MP_MODO=real + MP_MODO_LEGADO=1 sin conexión → token global, auditado", async () => {
  const env = { MP_MODO: "real", MP_ACCESS_TOKEN: "APP_USR-abc", MP_MODO_LEGADO: "1" };
  const auditados: string[] = [];
  const p = await crearPasarelaCobrosPara("t1", env, puerto(env, {}, auditados));
  assert.ok(p instanceof HttpPasarelaCobros);
  assert.equal(await tokenDe(p), "APP_USR-abc");
  assert.deepEqual(auditados, ["t1"]);
});

// Certificación P1 (ADV-C4a): el link de cobro no puede salir con la cuenta del despliegue.
test("ADV-C4a: negocio SIN conexión y SIN MP_MODO_LEGADO → el link falla cerrado (CobrosSinConexionError)", async () => {
  const env = { MP_MODO: "real", MP_ACCESS_TOKEN: "APP_USR-token-global-del-despliegue" };
  await assert.rejects(crearPasarelaCobrosPara("negocio-sin-conexion", env, puerto(env)), CobrosSinConexionError);
});

// Certificación P1 (ADV-C4b): cada negocio cobra con el token de SU conexión, nunca uno común.
test("ADV-C4b: negocios CON conexión → cada link sale con el access_token de su conexión", async () => {
  const env = { MP_MODO: "real", MP_ACCESS_TOKEN: "APP_USR-token-global-del-despliegue" };
  const cx = puerto(env, { a: "APP_USR-de-a", b: "APP_USR-de-b" });
  const [ta, tb] = [await tokenDe(await crearPasarelaCobrosPara("a", env, cx)), await tokenDe(await crearPasarelaCobrosPara("b", env, cx))];
  assert.equal(ta, "APP_USR-de-a");
  assert.equal(tb, "APP_USR-de-b");
});
