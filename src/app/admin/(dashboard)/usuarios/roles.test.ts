import { test } from "node:test";
import assert from "node:assert/strict";
import { etiquetaDeRol, rolAdmitidoEnAlta, rolSinPantallas, rolesParaAlta } from "./roles";

test("en un negocio sin agenda no se ofrece Profesional y Recepción se dice Mostrador", () => {
  const mostrador = rolesParaAlta(true);
  assert.deepEqual(mostrador.map((r) => r.valor), ["OWNER", "RECEPTION"]);
  assert.match(mostrador[1].etiqueta, /^Mostrador/);
  assert.equal(etiquetaDeRol("RECEPTION", true), "Mostrador");
  // Un Profesional que ya existe queda señalado: no tiene ninguna pantalla para abrir.
  assert.equal(rolSinPantallas("PROFESSIONAL", true), true);
  assert.equal(rolSinPantallas("RECEPTION", true), false);
});

test("en servicios (CH) queda exactamente como estaba", () => {
  assert.deepEqual(rolesParaAlta(false), [
    { valor: "OWNER", etiqueta: "Dueño/a (todo)" },
    { valor: "RECEPTION", etiqueta: "Recepción (agenda + clientes + cobrar)" },
    { valor: "PROFESSIONAL", etiqueta: "Profesional (solo su agenda)" },
  ]);
  assert.deepEqual(["OWNER", "RECEPTION", "PROFESSIONAL"].map((r) => etiquetaDeRol(r, false)), ["Dueño/a", "Recepción", "Profesional"]);
  assert.equal(rolSinPantallas("PROFESSIONAL", false), false);
});

test("el servidor admite en el alta sólo los roles que ofrece la pantalla", () => {
  // Sin agenda: Profesional rechazado aunque llegue por un POST a mano.
  assert.equal(rolAdmitidoEnAlta("PROFESSIONAL", true), false);
  assert.equal(rolAdmitidoEnAlta("RECEPTION", true), true);
  assert.equal(rolAdmitidoEnAlta("OWNER", true), true);
  // CH (servicios): los tres, como siempre.
  for (const r of ["OWNER", "RECEPTION", "PROFESSIONAL"]) assert.equal(rolAdmitidoEnAlta(r, false), true, r);
  // Lo que no es un rol, nunca.
  assert.equal(rolAdmitidoEnAlta("ADMIN", false), false);
  assert.equal(rolAdmitidoEnAlta("", true), false);
});
