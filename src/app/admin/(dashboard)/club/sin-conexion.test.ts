import { test } from "node:test";
import assert from "node:assert/strict";
import { SIN_CONEXION } from "./sin-conexion";
import { SIN_CONEXION_PARA_FIRMAR } from "./firma-del-duenio";
import { SIN_CONEXION_PARA_APROBAR } from "./aprobar-core";

test("sin conexión: firmar, validar el código y aprobar dicen lo mismo, y dicen qué hacer", () => {
  assert.equal(SIN_CONEXION_PARA_FIRMAR, SIN_CONEXION);
  assert.equal(SIN_CONEXION_PARA_APROBAR, SIN_CONEXION);
  assert.match(SIN_CONEXION, /revisá el wifi o los datos y probá de nuevo/);
  assert.match(SIN_CONEXION, /No se hizo nada\.$/);
});
