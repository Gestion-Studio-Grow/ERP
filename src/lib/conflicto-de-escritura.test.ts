// ¿Conflicto de escritura? Con los errores TAL COMO los arma Prisma 7.8 con el adaptador pg
// (forma medida contra el Postgres local en la integración de la ola 2), y la decisión
// EJECUTADA: `tenantTransaction` en Serializable reintenta un 40001 de una consulta cruda.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@/generated/prisma/client";
import { basePrisma } from "@/lib/prisma-base";
import { bookingTransaction, tenantTransaction, trasladoTransaction } from "@/lib/rls";
import { esConflictoDeEscritura } from "./conflicto-de-escritura";

/** Un P2010 de consulta cruda como el medido: SQLSTATE en el mensaje y en el meta. */
function crudo(sqlstate: string, mensaje: string, kind = "postgres") {
  return new Prisma.PrismaClientKnownRequestError(
    `\nInvalid \`prisma.$executeRaw()\` invocation:\n\n\nRaw query failed. Code: \`${sqlstate}\`. Message: \`${mensaje}\``,
    {
      code: "P2010",
      clientVersion: "7.8.0",
      meta: { driverAdapterError: { name: "DriverAdapterError", cause: { originalCode: sqlstate, originalMessage: mensaje, kind } } },
    },
  );
}

const SERIALIZACION = crudo("40001", "could not serialize access due to concurrent update", "TransactionWriteConflict");
const DEADLOCK = crudo("40P01", "deadlock detected");

/**
 * El `DriverAdapterError` CRUDO que tira el adaptador pg cuando el abort salta en el GUC o en el
 * COMMIT (CERT Matías T2+T3, F-1). Misma forma que la clase de `@prisma/driver-adapter-utils`:
 * `name` fijo, mensaje = `kind`, `cause` = lo que arma `convertDriverError`. Sin `code`.
 */
class DriverAdapterErrorDePrueba extends Error {
  override name = "DriverAdapterError";
  override cause: Record<string, unknown>;
  constructor(cause: Record<string, unknown>) {
    super(String(cause.kind));
    this.cause = cause;
  }
}
const ADAPTADOR_40001 = new DriverAdapterErrorDePrueba({
  originalCode: "40001",
  originalMessage: "could not serialize access due to read/write dependencies among transactions",
  kind: "TransactionWriteConflict",
});

test("conflicto: P2034 de modelo, y P2010 con 40001 o 40P01 de una consulta cruda", () => {
  assert.equal(
    esConflictoDeEscritura(new Prisma.PrismaClientKnownRequestError("write conflict", { code: "P2034", clientVersion: "7.8.0" })),
    true,
  );
  assert.equal(esConflictoDeEscritura(SERIALIZACION), true);
  assert.equal(esConflictoDeEscritura(DEADLOCK), true);
  // Sin meta (otro adaptador): alcanza el SQLSTATE del mensaje.
  const sinMeta = Object.assign(new Error("Raw query failed. Code: `40001`. Message: `could not serialize`"), { code: "P2010" });
  assert.equal(esConflictoDeEscritura(sinMeta), true);
});

test("conflicto: el DriverAdapterError crudo del adaptador pg (sin code), por kind o por SQLSTATE (F-1)", () => {
  assert.equal(esConflictoDeEscritura(ADAPTADOR_40001), true);
  // Sin `kind` conocido pero con el SQLSTATE (así llega un 40P01: kind "postgres").
  assert.equal(esConflictoDeEscritura(new DriverAdapterErrorDePrueba({ originalCode: "40P01", originalMessage: "deadlock detected", kind: "postgres" })), true);
  // Sólo el kind, sin originalCode.
  assert.equal(esConflictoDeEscritura(new DriverAdapterErrorDePrueba({ kind: "TransactionWriteConflict" })), true);
  // Envuelto como `cause` de otro error (una capa que lo re-tira).
  assert.equal(esConflictoDeEscritura(new Error("falló el commit", { cause: ADAPTADOR_40001 })), true);
  // Un objeto plano con la forma (lo que queda tras serializar) también.
  assert.equal(esConflictoDeEscritura({ name: "DriverAdapterError", cause: { kind: "TransactionWriteConflict" } }), true);
});

test("no es conflicto: un DriverAdapterError de otra cosa (único, tabla, conexión) ni un nombre sin causa", () => {
  assert.equal(esConflictoDeEscritura(new DriverAdapterErrorDePrueba({ originalCode: "23505", kind: "UniqueConstraintViolation" })), false);
  assert.equal(esConflictoDeEscritura(new DriverAdapterErrorDePrueba({ originalCode: "42P01", kind: "TableDoesNotExist" })), false);
  assert.equal(esConflictoDeEscritura(new DriverAdapterErrorDePrueba({ kind: "DatabaseNotReachable" })), false);
  assert.equal(esConflictoDeEscritura(Object.assign(new Error("TransactionWriteConflict"), { name: "DriverAdapterError" })), false);
  assert.equal(esConflictoDeEscritura(new Error("x", { cause: "TransactionWriteConflict" })), false);
  assert.equal(esConflictoDeEscritura(undefined), false);
});

test("no es conflicto: otro SQLSTATE crudo, otro código de Prisma, un Error suelto o un texto", () => {
  assert.equal(esConflictoDeEscritura(crudo("42703", "column \"category\" does not exist")), false);
  assert.equal(esConflictoDeEscritura(crudo("23505", "duplicate key value violates unique constraint")), false);
  assert.equal(
    esConflictoDeEscritura(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.8.0" })),
    false,
  );
  assert.equal(esConflictoDeEscritura(new Error("40001")), false);
  assert.equal(esConflictoDeEscritura("40001"), false);
  assert.equal(esConflictoDeEscritura(null), false);
});

/**
 * `basePrisma.$transaction` falso: falla las primeras `fallas` veces con `error` y después
 * corre el callback. Sin RLS_ENFORCEMENT (así corren los tests) `tenantTransaction` llama
 * directo a `basePrisma.$transaction`.
 */
async function conTransaccionFalsa<T>(error: Error, fallas: number, correr: () => Promise<T>): Promise<{ r: T | Error; intentos: number }> {
  const original = basePrisma.$transaction;
  let intentos = 0;
  (basePrisma as unknown as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    intentos++;
    if (intentos <= fallas) throw error;
    return fn({});
  };
  try {
    const r = await correr().catch((e: Error) => e);
    return { r, intentos };
  } finally {
    (basePrisma as unknown as { $transaction: unknown }).$transaction = original;
  }
}

test("tenantTransaction Serializable reintenta un 40001 de una consulta cruda (antes lo propagaba)", async () => {
  const { r, intentos } = await conTransaccionFalsa(SERIALIZACION, 1, () =>
    tenantTransaction(async () => "grabado", { tenantId: "t-qa", isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
  );
  assert.equal(r, "grabado");
  assert.equal(intentos, 2, "un reintento");
});

test("tenantTransaction: un error que no es conflicto sube sin reintentar, y el conflicto tiene tope", async () => {
  const otro = crudo("23505", "duplicate key value violates unique constraint");
  const unaVez = await conTransaccionFalsa(otro, 1, () =>
    tenantTransaction(async () => "grabado", { tenantId: "t-qa", isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
  );
  assert.equal(unaVez.r, otro);
  assert.equal(unaVez.intentos, 1);

  // Siempre en conflicto: 1 intento + 3 reintentos, y después el error sube.
  const siempre = await conTransaccionFalsa(SERIALIZACION, 99, () =>
    tenantTransaction(async () => "grabado", { tenantId: "t-qa", isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
  );
  assert.equal(siempre.r, SERIALIZACION);
  assert.equal(siempre.intentos, 4);

  // Fuera de Serializable no se reintenta (default: 0 reintentos).
  const rc = await conTransaccionFalsa(SERIALIZACION, 1, () => tenantTransaction(async () => "grabado", { tenantId: "t-qa" }));
  assert.equal(rc.r, SERIALIZACION);
  assert.equal(rc.intentos, 1);
});

test("F-1: tenantTransaction, bookingTransaction y trasladoTransaction reintentan el DriverAdapterError crudo", async () => {
  const tenant = await conTransaccionFalsa(ADAPTADOR_40001, 2, () =>
    tenantTransaction(async () => "grabado", { tenantId: "t-qa", isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
  );
  assert.equal(tenant.r, "grabado");
  assert.equal(tenant.intentos, 3);

  const reserva = await conTransaccionFalsa(ADAPTADOR_40001, 1, () => bookingTransaction(async () => "reservado", { tenantId: "t-qa" }));
  assert.equal(reserva.r, "reservado");
  assert.equal(reserva.intentos, 2);

  const traslado = await conTransaccionFalsa(ADAPTADOR_40001, 1, () =>
    trasladoTransaction({ origen: "t-a", destino: "t-b" }, async () => "trasladado"),
  );
  assert.equal(traslado.r, "trasladado");
  assert.equal(traslado.intentos, 2);

  // Con tope: si nunca deja de chocar, sube el mismo error (el llamador decide qué decir).
  const siempre = await conTransaccionFalsa(ADAPTADOR_40001, 99, () => bookingTransaction(async () => "x", { tenantId: "t-qa" }));
  assert.equal(siempre.r, ADAPTADOR_40001);
  assert.equal(siempre.intentos, 4);
});
