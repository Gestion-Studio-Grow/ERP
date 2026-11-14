// La regla pura de A QUÉ OWNER se le resetea la contraseña (consola y script de seguridad).
import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirOwner } from "@/lib/operador/elegir-owner";

const fundadora = { id: "u1", email: "fundadora@negocio.test" };
const socia = { id: "u2", email: "Socia@Negocio.test" };

test("un solo dueño y sin criterio: ése, como siempre", () => {
  assert.deepEqual(elegirOwner([fundadora]), { ok: true, ownerId: "u1" });
});

test("ningún dueño: se niega", () => {
  assert.deepEqual(elegirOwner([]), { ok: false, motivo: "sin-owner" });
  assert.deepEqual(elegirOwner([], { ownerId: "u1" }), { ok: false, motivo: "no-coincide" });
});

test("varios dueños y sin criterio: se niega (no elige al más antiguo)", () => {
  assert.deepEqual(elegirOwner([fundadora, socia]), { ok: false, motivo: "varios" });
  assert.deepEqual(elegirOwner([fundadora, socia], { ownerId: "  " }), { ok: false, motivo: "varios" });
});

test("con ownerId: sólo uno de la lista; si no está, se niega", () => {
  assert.deepEqual(elegirOwner([fundadora, socia], { ownerId: "u2" }), { ok: true, ownerId: "u2" });
  assert.deepEqual(elegirOwner([fundadora, socia], { ownerId: "otro" }), { ok: false, motivo: "no-coincide" });
  assert.deepEqual(elegirOwner([fundadora], { ownerId: "otro" }), { ok: false, motivo: "no-coincide" });
});

test("con email: sin espacios ni mayúsculas, y sin comodines", () => {
  assert.deepEqual(elegirOwner([fundadora, socia], { email: " socia@negocio.TEST " }), { ok: true, ownerId: "u2" });
  assert.deepEqual(elegirOwner([fundadora, socia], { email: "%@negocio.test" }), { ok: false, motivo: "no-coincide" });
});
