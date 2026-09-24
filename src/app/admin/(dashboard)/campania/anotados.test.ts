// La lectura de anotados: tabla ausente → estado vacío; cualquier otra falla sigue.

import { test } from "node:test";
import assert from "node:assert/strict";
import { leerAnotados } from "./anotados";

test("con la tabla, devuelve los anotados tal cual", async () => {
  const r = await leerAnotados(async () => [{ id: "a" }, { id: "b" }]);
  assert.deepEqual(r, { estado: "ok", leads: [{ id: "a" }, { id: "b" }] });
});

test("sin la tabla (P2021) o sin una columna (P2022), la pantalla muestra el estado vacío", async () => {
  for (const code of ["P2021", "P2022"]) {
    const r = await leerAnotados(async () => {
      throw Object.assign(new Error("no existe"), { code });
    });
    assert.deepEqual(r, { estado: "sin-tabla" }, code);
  }
});

test("cualquier otra falla no se disfraza de 'campaña no habilitada'", async () => {
  const caida = Object.assign(new Error("conexión"), { code: "P1001" });
  await assert.rejects(
    leerAnotados(async () => {
      throw caida;
    }),
    caida,
  );
  await assert.rejects(
    leerAnotados(async () => {
      throw "texto";
    }),
  );
});
