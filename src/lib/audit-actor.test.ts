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

test("desde la red de locales se ve la persona o de dónde vino, nunca el actor crudo", () => {
  const nombres = new Map([["u1", "Carla"]]);
  // El catálogo que manda la casa: el usuario es de la casa (otro negocio), acá no tiene nombre.
  assert.equal(formatActor("casa:cmcasa1:user:u77", nombres), "La casa de la red");
  // Si la persona es de este negocio (la casa mirando su propia auditoría), se la nombra.
  assert.equal(formatActor("casa:cmcasa1:user:u1", nombres), "Carla");
  assert.equal(formatActor("traslado:user:u1", nombres), "Carla");
  assert.equal(formatActor("traslado:user:u77", nombres), "Traslado entre locales");
  // El cupón que guarda el alta del pedido (order-core.ts) lo escribe el sistema.
  assert.equal(formatActor("system", nombres), "El sistema");
  for (const actor of ["casa:x:user:y", "traslado:user:y", "system"]) {
    assert.ok(!formatActor(actor, nombres).includes(":"), actor);
  }
});
