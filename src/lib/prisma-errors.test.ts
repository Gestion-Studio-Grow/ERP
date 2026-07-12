// Tests de los clasificadores de error de Prisma (P2002 unique / P2022 columna ausente).
// Se fabrican INSTANCIAS REALES de PrismaClientKnownRequestError → valida lo que corre en prod.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { isUniqueViolation, isColumnMissing, isPrismaError } from "./prisma-errors";

function p2002(target: string | string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.8.0",
    meta: { target },
  });
}
function p2022(column: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Column does not exist", {
    code: "P2022",
    clientVersion: "7.8.0",
    meta: { column },
  });
}

test("isUniqueViolation: distingue el índice de correlativo del de idempotencia (por constraint name)", () => {
  const codeErr = p2002("Order_tenantId_code_key");
  const keyErr = p2002("Order_tenantId_idempotencyKey_key");
  assert.equal(isUniqueViolation(codeErr, "code"), true);
  assert.equal(isUniqueViolation(codeErr, "idempotencyKey"), false);
  assert.equal(isUniqueViolation(keyErr, "idempotencyKey"), true);
  assert.equal(isUniqueViolation(keyErr, "code"), false);
});

test("isUniqueViolation: también matchea cuando target viene como lista de campos", () => {
  const err = p2002(["tenantId", "orderId", "type"]);
  assert.equal(isUniqueViolation(err, "orderId"), true);
  assert.equal(isUniqueViolation(err, "type"), true);
  assert.equal(isUniqueViolation(err, "code"), false);
});

test("isUniqueViolation: sin field, cualquier P2002 cuenta; otro código no", () => {
  assert.equal(isUniqueViolation(p2002("x"), undefined), true);
  assert.equal(isUniqueViolation(new Error("boom")), false);
  assert.equal(isUniqueViolation(p2022("foo")), false);
});

test("isColumnMissing: detecta P2022 y opcionalmente la columna exacta", () => {
  assert.equal(isColumnMissing(p2022("Order.idempotencyKey"), "idempotencyKey"), true);
  assert.equal(isColumnMissing(p2022("Order.otra"), "idempotencyKey"), false);
  assert.equal(isColumnMissing(p2022("cualquiera")), true);
  assert.equal(isColumnMissing(p2002("x")), false);
});

test("isPrismaError: match por código", () => {
  assert.equal(isPrismaError(p2002("x"), "P2002"), true);
  assert.equal(isPrismaError(p2002("x"), "P2034"), false);
  assert.equal(isPrismaError(new Error("no"), "P2002"), false);
});
