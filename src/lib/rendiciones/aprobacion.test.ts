// Aprobación de un nivel (recorte MIA de origin/frente/rendiciones): DIRECCION o ADMINISTRACION, nunca quien rinde.

import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoNoAprueba, nivelesDeAprobacion, puedeAprobar } from "./aprobacion";

test("aprueban Dirección y Administración; Comercial, Producción, Diseño y Sin ficha no", () => {
  assert.equal(puedeAprobar("DIRECCION", "dir", "comercial"), true);
  assert.equal(puedeAprobar("ADMINISTRACION", "adm", "comercial"), true);
  for (const rol of ["COMERCIAL", "PRODUCCION", "DISENO", "SIN_FICHA"] as const) {
    assert.equal(puedeAprobar(rol, "otro", "comercial"), false, rol);
  }
});

test("nadie aprueba lo propio, ni Dirección", () => {
  assert.equal(puedeAprobar("DIRECCION", "dir", "dir"), false);
  assert.equal(puedeAprobar("ADMINISTRACION", "adm", "adm"), false);
  assert.equal(motivoNoAprueba("DIRECCION", "dir", "dir"), "Nadie aprueba lo propio: esta rendición es tuya");
  assert.equal(motivoNoAprueba("COMERCIAL", "c", "x"), "Sólo Dirección o Administración aprueban rendiciones");
});

test("nivelesDeAprobacion: un solo nivel, los aprobadores menos quien rinde", () => {
  const equipo = [
    { id: "dir", rol: "DIRECCION" as const },
    { id: "adm", rol: "ADMINISTRACION" as const },
    { id: "com", rol: "COMERCIAL" as const },
  ];
  assert.deepEqual(nivelesDeAprobacion("com", equipo), [["dir", "adm"]]);
  assert.deepEqual(nivelesDeAprobacion("dir", equipo), [["adm"]]);
  assert.deepEqual(nivelesDeAprobacion("x", []), [[]]);
});
