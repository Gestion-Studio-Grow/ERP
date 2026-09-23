// Qué pasó con una consulta cruda de lotes o despiece. Las formas de los errores son las que
// devuelve Prisma 7 con el adaptador de pg (medidas contra el Postgres local: ver la cabecera
// de errores.ts); lo que no se reconoce es "otro", y eso se loguea y se dice, nunca se traga.

import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoDelError } from "./errores";

const cruda = (originalCode: string, kind?: string) =>
  Object.assign(new Error(`Invalid \`prisma.$executeRaw()\` invocation: Raw query failed. Code: \`${originalCode}\`.`), {
    code: "P2010",
    meta: { driverAdapterError: { cause: { originalCode, ...(kind ? { kind } : {}) } } },
  });

test("tabla o columna que no existe (antes de la migración): sin-migracion", () => {
  assert.equal(motivoDelError(cruda("42P01", "TableDoesNotExist")), "sin-migracion");
  assert.equal(motivoDelError(cruda("42703", "ColumnNotFound")), "sin-migracion");
  assert.equal(motivoDelError(Object.assign(new Error("x"), { code: "42P01" })), "sin-migracion", "el driver directo");
});

test("número de lote repetido: duplicado", () => {
  assert.equal(motivoDelError(cruda("23505", "UniqueConstraintViolation")), "duplicado");
  // Sólo con el SQLSTATE en el mensaje también se reconoce.
  assert.equal(motivoDelError(Object.assign(new Error("Raw query failed. Code: `23505`. Message: duplicate key"), { code: "P2010" })), "duplicado");
});

test("cualquier otra cosa (base caída, error de tipo): otro — no se confunde con 'falta la migración'", () => {
  assert.equal(motivoDelError(cruda("42804")), "otro");
  assert.equal(motivoDelError(new Error("Can't reach database server")), "otro");
  assert.equal(motivoDelError(null), "otro");
  assert.equal(motivoDelError("texto"), "otro");
});
