// Los números del pool y la llave del empaquetado del BEGIN (db-pool.ts), como los lee
// prisma-base.ts al armar el cliente: lo que manda el entorno y lo que vale si falta o no sirve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITES_POR_DEFECTO, empaquetarBeginConNegocio, leerTenantSinTransaccion, limitesDelPool } from "./db-pool";

test("sin variables: 5 conexiones (lo de siempre), 10 s de espera, 30 s ociosa", () => {
  assert.deepEqual(limitesDelPool({}), { conexiones: 5, esperaConexionMs: 10_000, ociosaMs: 30_000 });
  assert.deepEqual(limitesDelPool({}), LIMITES_POR_DEFECTO);
});

test("lo que manda el entorno, entero y positivo; lo que no sirve cae al de por defecto", () => {
  assert.deepEqual(limitesDelPool({ DB_CONNECTION_LIMIT: "5", DB_CONNECT_TIMEOUT_MS: "3000", DB_IDLE_TIMEOUT_MS: "1000" }), {
    conexiones: 5,
    esperaConexionMs: 3000,
    ociosaMs: 1000,
  });
  assert.equal(limitesDelPool({ DB_CONNECTION_LIMIT: "7.9" }).conexiones, 7);
  for (const malo of ["0", "-3", "diez", "", " ", undefined]) {
    assert.equal(limitesDelPool({ DB_CONNECTION_LIMIT: malo }).conexiones, 5, String(malo));
  }
});

test("el BEGIN va junto con el negocio SÓLO con DB_BEGIN_CON_NEGOCIO=on (apagado por defecto)", () => {
  assert.equal(empaquetarBeginConNegocio({}), false);
  assert.equal(empaquetarBeginConNegocio({ DB_BEGIN_CON_NEGOCIO: "on" }), true);
  assert.equal(empaquetarBeginConNegocio({ DB_BEGIN_CON_NEGOCIO: " ON " }), true);
  for (const otro of ["off", "", "1", "true", "si", undefined]) {
    assert.equal(empaquetarBeginConNegocio({ DB_BEGIN_CON_NEGOCIO: otro }), false, String(otro));
  }
});

test("Tenant sin transacción SÓLO con DB_TENANT_DIRECTO=on (apagado por defecto)", () => {
  assert.equal(leerTenantSinTransaccion({}), false);
  assert.equal(leerTenantSinTransaccion({ DB_TENANT_DIRECTO: "on" }), true);
  for (const otro of ["off", "", "1", "true", undefined]) {
    assert.equal(leerTenantSinTransaccion({ DB_TENANT_DIRECTO: otro }), false, String(otro));
  }
});
