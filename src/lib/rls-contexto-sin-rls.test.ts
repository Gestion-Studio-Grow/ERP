// SEG-021: `tenantTransaction` con el flag de RLS APAGADO (el defecto, `RLS_ENFORCEMENT` distinto
// de "on") tiene que cargar el store ALS igual que la rama con RLS y que `fasesSobre`: adentro del
// callback el negocio resuelto es el de la transacción y `insideTx` queda prendido. Sin base: se
// reemplaza `basePrisma.$transaction` por uno falso que corre el callback con un `tx` de mentira.

import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { basePrisma, RLS_ENFORCEMENT } from "./prisma-base";
import { tenantTransaction } from "./rls";
import { getTenantStore, runInTenantContext } from "./tenant-context";

type Fila = Record<string, unknown>;
const txFalso = { client: { findMany: async (args: unknown) => args as Fila } };

// El cliente de Prisma expone `$transaction` como accesor (no como método), así que `mock.method`
// no lo toma: se pisa la propiedad y se borra al terminar cada test (el proxy vuelve a servir el
// original; re-definir el descriptor copiado lo dejaría en undefined).
type ConTransaccion = { $transaction: (...a: unknown[]) => unknown };
const cliente = basePrisma as unknown as ConTransaccion;

function simularTransaccion() {
  const llamadas = mock.fn(async (cb: unknown) => (cb as (tx: unknown) => Promise<unknown>)(txFalso));
  Object.defineProperty(cliente, "$transaction", { value: llamadas, configurable: true, writable: true });
  return llamadas;
}

const original = cliente.$transaction;

afterEach(() => {
  delete (cliente as Partial<ConTransaccion>).$transaction;
});

test("el flag de RLS está apagado en este test (rama sin RLS)", () => {
  assert.equal(RLS_ENFORCEMENT, false);
});

test("sin RLS: adentro del callback el store tiene el negocio explícito e insideTx", async () => {
  const llamadas = simularTransaccion();
  const visto = await tenantTransaction(async () => getTenantStore(), { tenantId: "B" });
  assert.deepEqual(visto, { tenantId: "B", insideTx: true });
  assert.equal(llamadas.mock.callCount(), 1);
});

test("sin RLS: el negocio de la transacción le gana al del request que la abre", async () => {
  simularTransaccion();
  const visto = await runInTenantContext("A", async () =>
    tenantTransaction(async () => getTenantStore(), { tenantId: "B" }),
  );
  assert.deepEqual(visto, { tenantId: "B", insideTx: true });
  // Al salir, el request vuelve a su contexto (o a ninguno).
  assert.equal(getTenantStore(), undefined);
});

test("sin RLS: una transacción anidada sin tenantId resuelve el negocio de la de afuera", async () => {
  simularTransaccion();
  const where = await tenantTransaction(
    async () => {
      assert.deepEqual(getTenantStore(), { tenantId: "B", insideTx: true });
      const args = await tenantTransaction(async (tx) =>
        (tx as unknown as typeof txFalso).client.findMany({ where: { id: "x" } }),
      );
      return (args as { where: Fila }).where;
    },
    { tenantId: "B" },
  );
  assert.deepEqual(where, { id: "x", tenantId: "B" });
});

test("al final, el $transaction original vuelve a estar disponible", () => {
  assert.equal(cliente.$transaction, original);
});
