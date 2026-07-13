// Auth del PLANO DE OPERADOR (control-plane cross-tenant). Foco: el FAIL-CLOSED en
// producción cuando faltan OPERATOR_SECRET y AUTH_SECRET (antes caía al string público
// "dev-operator-secret" → cookie operator_session forjable = acceso a TODOS los tenants).
// Cubre además checkOperatorPassword (que no tenía test — el único auth del control-plane).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createOperatorToken, readOperatorToken, checkOperatorPassword } from "./operator-auth";

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  const keys = ["NODE_ENV", "OPERATOR_SECRET", "AUTH_SECRET", "OPERATOR_PASSWORD"];
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else (process.env as Record<string, string>)[k] = v;
    }
    await fn();
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else (process.env as Record<string, string>)[k] = prev[k]!;
    }
  }
}

test("dev sin secretos: firma con fallback y el token round-trip-ea", async () => {
  await withEnv({ NODE_ENV: "development", OPERATOR_SECRET: undefined, AUTH_SECRET: undefined }, async () => {
    const token = await createOperatorToken();
    assert.equal(await readOperatorToken(token), "operator");
  });
});

test("prod SIN OPERATOR_SECRET ni AUTH_SECRET: FAIL-CLOSED — firmar lanza", async () => {
  await withEnv({ NODE_ENV: "production", OPERATOR_SECRET: undefined, AUTH_SECRET: undefined }, async () => {
    await assert.rejects(() => createOperatorToken(), /OPERATOR_SECRET/);
  });
});

test("prod con OPERATOR_SECRET: firma y verifica normalmente", async () => {
  await withEnv({ NODE_ENV: "production", OPERATOR_SECRET: "secreto-operador-prod" }, async () => {
    const token = await createOperatorToken();
    assert.equal(await readOperatorToken(token), "operator");
  });
});

test("checkOperatorPassword: en prod SIN OPERATOR_PASSWORD nunca acepta (ni el default de dev)", async () => {
  await withEnv({ NODE_ENV: "production", OPERATOR_PASSWORD: undefined }, async () => {
    assert.equal(checkOperatorPassword("operador"), false);
    assert.equal(checkOperatorPassword(""), false);
  });
});

test("checkOperatorPassword: matchea la OPERATOR_PASSWORD seteada, rechaza el resto", async () => {
  await withEnv({ NODE_ENV: "production", OPERATOR_PASSWORD: "clave-larga-operador" }, async () => {
    assert.equal(checkOperatorPassword("clave-larga-operador"), true);
    assert.equal(checkOperatorPassword("clave-larga-operadoX"), false);
    assert.equal(checkOperatorPassword("otra"), false);
  });
});

test("dev sin OPERATOR_PASSWORD: acepta 'operador' para probar local", async () => {
  await withEnv({ NODE_ENV: "development", OPERATOR_PASSWORD: undefined }, async () => {
    assert.equal(checkOperatorPassword("operador"), true);
    assert.equal(checkOperatorPassword("mala"), false);
  });
});
