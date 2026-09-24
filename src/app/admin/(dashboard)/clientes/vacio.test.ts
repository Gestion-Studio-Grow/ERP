// Clientes vacío: el botón al alta de turno sólo para quien puede darlo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { vacioDeClientes } from "./vacio";

test("quien gestiona la agenda da el primer turno desde el estado vacío", () => {
  assert.deepEqual(vacioDeClientes({ puedeDarTurno: true }).accion, { href: "/admin/turnos/lista?nuevo=1", etiqueta: "Dar un turno" });
});

test("sin agenda a mano no hay botón, sólo cómo nacen las fichas", () => {
  const p = vacioDeClientes({ puedeDarTurno: false });
  assert.equal(p.accion, null);
  assert.match(p.descripcion, /se crean solas/);
});
