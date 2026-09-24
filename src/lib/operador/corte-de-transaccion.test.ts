import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_NO_RESPONDIO, CANDADO_OCUPADO, motivoDeCorte } from "./corte-de-transaccion";

function error(code: string | undefined, message: string) {
  return Object.assign(new Error(message), code ? { code } : {});
}

test("candado ocupado (55P03, lock_timeout) y base que no respondió (P2028) dan mensajes distintos", () => {
  // El error tal cual lo devolvió Prisma en el test contra Postgres (interruptores-escritura.test.ts).
  assert.equal(
    motivoDeCorte(error("P2010", "Raw query failed. Code: `55P03`. Message: `canceling statement due to lock timeout`")),
    CANDADO_OCUPADO,
  );
  assert.equal(motivoDeCorte(error("P2028", "Transaction API error: Unable to start a transaction in the given time.")), BASE_NO_RESPONDIO);
  assert.equal(
    motivoDeCorte(error("P2028", "Transaction API error: Transaction already closed: the timeout for this transaction was 15000 ms")),
    BASE_NO_RESPONDIO,
  );
  assert.notEqual(CANDADO_OCUPADO, BASE_NO_RESPONDIO);
  // Cualquier otra cosa no se traduce.
  assert.equal(motivoDeCorte(error("P2002", "Unique constraint failed")), null);
  assert.equal(motivoDeCorte(new Error("otra cosa")), null);
  assert.equal(motivoDeCorte("texto"), null);
});
