import { test } from "node:test";
import assert from "node:assert/strict";
import { formatActor } from "./audit-actor";

test("la Auditoría del negocio nunca muestra el nombre de un operador de GSG: dice 'GSG'", () => {
  const nombres = new Map([["u1", "Carla"]]);
  // Incluye la forma de antes de la tanda 2b (`operator:operator`), que CH ya tiene guardada.
  for (const actor of ["operator:operator", "operator:facu", "operator:duenio", "operator:laboratorio"]) {
    assert.equal(formatActor(actor, nombres), "GSG", actor);
  }
  // El resto, como siempre.
  assert.equal(formatActor("user:u1", nombres), "Carla");
  assert.equal(formatActor("user:u9", nombres), "Usuario eliminado");
  assert.equal(formatActor("admin", nombres), "admin (histórico)");
  assert.equal(formatActor("cliente:1155", nombres), "Cliente 1155");
});
