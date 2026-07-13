// Firma del token de sesión del panel (auth.ts). Foco: el FAIL-CLOSED en producción
// cuando falta AUTH_SECRET (antes caía a un string público "dev-secret" → cookie
// forjable = bypass de auth). También el round-trip firma/verificación en dev.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken, readSessionToken } from "./auth";

// Guarda y restaura env alrededor de cada aserción (el test runner aísla por archivo,
// pero restauramos igual para no ensuciar otros tests del mismo archivo).
async function withEnv(
  env: { NODE_ENV?: string; AUTH_SECRET?: string | undefined },
  fn: () => Promise<void>,
) {
  const prevNode = process.env.NODE_ENV;
  const prevSecret = process.env.AUTH_SECRET;
  try {
    if ("NODE_ENV" in env) (process.env as Record<string, string>).NODE_ENV = env.NODE_ENV!;
    if ("AUTH_SECRET" in env) {
      if (env.AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = env.AUTH_SECRET;
    }
    await fn();
  } finally {
    (process.env as Record<string, string>).NODE_ENV = prevNode as string;
    if (prevSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prevSecret;
  }
}

test("dev sin AUTH_SECRET: firma con fallback y el token round-trip-ea", async () => {
  await withEnv({ NODE_ENV: "development", AUTH_SECRET: undefined }, async () => {
    const token = await createSessionToken("user_123");
    assert.equal(await readSessionToken(token), "user_123");
  });
});

test("prod SIN AUTH_SECRET: FAIL-CLOSED — firmar lanza (no cae a 'dev-secret')", async () => {
  await withEnv({ NODE_ENV: "production", AUTH_SECRET: undefined }, async () => {
    await assert.rejects(() => createSessionToken("user_123"), /AUTH_SECRET/);
  });
});

test("prod CON AUTH_SECRET: firma y verifica normalmente", async () => {
  await withEnv({ NODE_ENV: "production", AUTH_SECRET: "un-secreto-real-de-prod" }, async () => {
    const token = await createSessionToken("user_123");
    assert.equal(await readSessionToken(token), "user_123");
  });
});

test("token con firma inválida se rechaza (null)", async () => {
  await withEnv({ NODE_ENV: "development", AUTH_SECRET: "s" }, async () => {
    assert.equal(await readSessionToken("user_123.deadbeef"), null);
    assert.equal(await readSessionToken(""), null);
    assert.equal(await readSessionToken("sinpunto"), null);
  });
});
