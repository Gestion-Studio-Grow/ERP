// La tarjeta vieja del turno: «Dar de baja» sólo con agenda:forgive, el medio obligatorio (B7) y
// la leyenda de los 5 estados (B4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLE_CAPABILITIES } from "@/lib/capabilities";
import { LEYENDA_DE_ESTADOS, puedeCompletarConMedio, puedeDarDeBajaSaldo, rolTieneCapacidad } from "./fila-core";

test("«Dar de baja el saldo»: la recepción y la profesional nunca; la dueña sólo si tiene agenda:forgive", () => {
  assert.equal(puedeDarDeBajaSaldo({ role: "RECEPTION" }), false);
  assert.equal(puedeDarDeBajaSaldo({ role: "PROFESSIONAL" }), false);
  assert.equal(puedeDarDeBajaSaldo(undefined), false);
  assert.equal(puedeDarDeBajaSaldo({ role: "INVENTADO" }), false);
  // La dueña sí: `agenda:forgive` es sólo de OWNER (contrato con 1-A, capabilities.ts).
  assert.equal(puedeDarDeBajaSaldo({ role: "OWNER" }), true);
  assert.ok((ROLE_CAPABILITIES.OWNER as readonly string[]).includes("agenda:forgive"));
});

test("rolTieneCapacidad lee el mapa por texto", () => {
  assert.equal(rolTieneCapacidad("RECEPTION", "agenda:collect"), true);
  assert.equal(rolTieneCapacidad("PROFESSIONAL", "agenda:manage"), false);
  assert.equal(rolTieneCapacidad(null, "agenda:read"), false);
  // Un rol inventado (o una clave del prototipo) no tiene nada.
  assert.equal(rolTieneCapacidad("toString", "agenda:read"), false);
});

test("B7: con saldo no se completa sin elegir el medio; sin saldo o dejando el saldo, sí", () => {
  assert.equal(puedeCompletarConMedio({ saldo: 9000, dejarSaldo: false, medio: "" }), false);
  assert.equal(puedeCompletarConMedio({ saldo: 9000, dejarSaldo: false, medio: "CHEQUE" }), false);
  assert.equal(puedeCompletarConMedio({ saldo: 9000, dejarSaldo: false, medio: "MERCADOPAGO" }), true);
  assert.equal(puedeCompletarConMedio({ saldo: 9000, dejarSaldo: true, medio: "" }), true);
  assert.equal(puedeCompletarConMedio({ saldo: 0, dejarSaldo: false, medio: "" }), true);
});

test("B4: la leyenda tiene los 5 estados, cada uno con su forma y su palabra (también «No se presentó»)", () => {
  assert.deepEqual(
    LEYENDA_DE_ESTADOS.map((e) => e.status).sort(),
    ["CANCELLED", "COMPLETED", "CONFIRMED", "NO_SHOW", "PENDING"],
  );
  assert.equal(LEYENDA_DE_ESTADOS.find((e) => e.status === "NO_SHOW")?.palabra, "No se presentó");
  // Formas distintas: el color no es lo único que distingue un estado.
  assert.equal(new Set(LEYENDA_DE_ESTADOS.map((e) => e.tipo)).size, LEYENDA_DE_ESTADOS.length);
});
