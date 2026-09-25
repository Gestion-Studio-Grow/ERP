// ADR-101 · apertura que coincide con el libro no escribe nada (relevo de turno). Arnés: un-solo-esperado.arnes.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest } from "@/test/base-efimera";
import { preparar } from "@/lib/caja/un-solo-esperado.arnes";

test("contra Postgres: una apertura que coincide con el libro no escribe diferencia (cambio de turno sin plata en juego)", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  const c = await preparar(laBase);
  const { a } = laBase;
  await c.operatorPrisma.cashMovement.create({
    data: { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 2_500.5, occurredAt: c.alMediodia(c.ayer), createdBy: "seed" },
  });
  assert.deepEqual(await c.abrir(a, "2.500,50"), { ok: true });
  assert.equal((await c.conMarca(a.id, c.marcas.APERTURA_TURNO_ACTOR_PREFIX)).length, 0);
  assert.deepEqual(await c.cerrarTurno(a, "2.500,50"), { ok: true });
  // Relevo: el segundo turno abre con lo que dejó el primero.
  assert.deepEqual(await c.abrir(a, "2.500,50"), { ok: true });
  assert.equal((await c.conMarca(a.id, c.marcas.APERTURA_TURNO_ACTOR_PREFIX)).length, 0);
  assert.equal((await c.conMarca(a.id, c.marcas.ARQUEO_TURNO_ACTOR_PREFIX)).length, 0);
});
