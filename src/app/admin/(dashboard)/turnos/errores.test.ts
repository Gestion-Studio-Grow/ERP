// El error de una acción que tira: se muestra el mensaje real si llegó, y el propio (que dice
// cómo seguir) si Next lo tapó en producción o no hay mensaje.

import { test } from "node:test";
import assert from "node:assert/strict";
import { esRedireccionDeNext, mensajeAccionable } from "./errores";

const PROPIO = "No se pudo reprogramar. Elegí otro horario.";

test("el mensaje de dominio llega entero", () => {
  assert.equal(
    mensajeAccionable(new Error("Ese profesional no trabaja en ese horario. Elegí otro."), PROPIO),
    "Ese profesional no trabaja en ese horario. Elegí otro.",
  );
});

test("el texto con que Next tapa el error en producción no se muestra: va el propio", () => {
  const tapado = Object.assign(
    new Error(
      "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
    ),
    { digest: "1234567" },
  );
  assert.equal(mensajeAccionable(tapado, PROPIO), PROPIO);
});

test("sin mensaje, o algo que no es un Error: el propio", () => {
  assert.equal(mensajeAccionable(new Error("   "), PROPIO), PROPIO);
  assert.equal(mensajeAccionable("falló", PROPIO), PROPIO);
  assert.equal(mensajeAccionable(undefined, PROPIO), PROPIO);
});

test("un redirect de la guardia no es un error: se reconoce para volver a tirarlo", () => {
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/admin/login;307;" });
  assert.equal(esRedireccionDeNext(redirect), true);
  assert.equal(esRedireccionDeNext(Object.assign(new Error("x"), { digest: "1234567" })), false);
  assert.equal(esRedireccionDeNext(new Error("Ese profesional ya no está disponible.")), false);
  assert.equal(esRedireccionDeNext(null), false);
});
