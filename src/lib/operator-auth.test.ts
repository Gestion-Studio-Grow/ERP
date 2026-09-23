// La consola del operador gobierna a TODOS los negocios. Estos tests ejecutan el ataque real: la
// cookie de sesión de un usuario de un negocio, puesta como cookie del operador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionToken } from "./auth";
import { createOperatorToken, readOperatorToken } from "./operator-auth";

function conEntorno<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const antes: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) antes[k] = process.env[k];
  const e = process.env as Record<string, string | undefined>;
  const poner = (vals: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vals)) {
      if (v === undefined) delete e[k];
      else e[k] = v;
    }
  };
  poner(env);
  return fn().finally(() => poner(antes));
}

test("ATAQUE: con el MISMO secreto, la sesión de un negocio no abre la consola", async () => {
  await conEntorno({ NODE_ENV: "development", AUTH_SECRET: "mismo", OPERATOR_SECRET: "mismo" }, async () => {
    const sesionDeRecepcion = await createSessionToken("user_recepcion_ch");
    assert.equal(await readOperatorToken(sesionDeRecepcion), null);
  });
});

test("ATAQUE: sin OPERATOR_SECRET (cae a AUTH_SECRET en dev), la sesión de un negocio tampoco", async () => {
  await conEntorno({ NODE_ENV: "development", AUTH_SECRET: "s", OPERATOR_SECRET: undefined }, async () => {
    assert.equal(await readOperatorToken(await createSessionToken("user_x")), null);
  });
});

test("el token del operador sigue funcionando", async () => {
  await conEntorno({ NODE_ENV: "development", AUTH_SECRET: "a", OPERATOR_SECRET: "b" }, async () => {
    assert.equal(await readOperatorToken(await createOperatorToken()), "operator");
  });
});

test("un payload distinto del operador no pasa, aunque la firma sea del operador", async () => {
  await conEntorno({ NODE_ENV: "development", AUTH_SECRET: "a", OPERATOR_SECRET: "b" }, async () => {
    const tok = await createOperatorToken();
    const firma = tok.slice(tok.lastIndexOf(".") + 1);
    assert.equal(await readOperatorToken(`otro.${firma}`), null);
  });
});

test("producción: sin OPERATOR_SECRET, o igual a AUTH_SECRET, falla cerrado", async () => {
  await conEntorno({ NODE_ENV: "production", AUTH_SECRET: "a", OPERATOR_SECRET: undefined }, async () => {
    await assert.rejects(createOperatorToken(), /OPERATOR_SECRET no está configurado/);
  });
  await conEntorno({ NODE_ENV: "production", AUTH_SECRET: "igual", OPERATOR_SECRET: "igual" }, async () => {
    await assert.rejects(createOperatorToken(), /no puede ser igual a AUTH_SECRET/);
    await assert.rejects(readOperatorToken("operator.abc"), /no puede ser igual a AUTH_SECRET/);
  });
});
