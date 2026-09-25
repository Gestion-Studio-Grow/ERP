// ADR-101 · el esperado que la PANTALLA muestra y hace confirmar es el `closingExpected` que queda
// asentado. El caso del refutador: se abre con $4.000, sale una devolución de $200 que no pasó por
// el turno y se cuentan $3.300. Antes la pantalla mostraba $4.000 esperados y hacía confirmar
// «faltan $700» mientras el servidor asentaba $3.800 esperados y un faltante de $500.
// Arnés: un-solo-esperado.arnes.ts (acciones reales, Postgres con RLS, dos negocios).
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest } from "@/test/base-efimera";
import { preparar } from "@/lib/caja/un-solo-esperado.arnes";
import { esperadoDelCajon } from "@/lib/caja/esperado-del-cajon";
import { round2 } from "@/lib/round";

test("contra Postgres: lo que la pantalla muestra como esperado es lo que el cierre asienta; una pantalla vieja no cierra", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  const c = await preparar(laBase);
  const { a, b } = laBase;

  await c.operatorPrisma.cashMovement.createMany({
    data: [
      { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 4_000, occurredAt: c.alMediodia(c.ayer), createdBy: "seed" },
      { tenantId: b.id, type: "VENTA", method: "EFECTIVO", amount: 7_777, occurredAt: c.alMediodia(c.ayer), createdBy: "seed" },
    ],
  });
  assert.deepEqual(await c.abrir(a, "4000"), { ok: true });
  const turno = await c.operatorPrisma.cashSession.findFirstOrThrow({ where: { tenantId: a.id, status: "OPEN" } });

  // Una devolución en efectivo que no pasó por este turno (sin `sessionId`).
  await c.operatorPrisma.cashMovement.create({
    data: { tenantId: a.id, sessionId: null, type: "EGRESO", method: "EFECTIVO", amount: 200, reason: "devolución", createdBy: "anulacion-turno:user:x" },
  });

  // Lo que ve el cajero: la misma cuenta que usan las dos pantallas del turno.
  const caja = await c.leerCaja(a);
  assert.ok(caja.open);
  const pantalla = esperadoDelCajon(caja.open, caja.esperadoEnElCajon);
  assert.equal(pantalla.delTurno, 4_000, "el turno solo no ve la devolución");
  assert.equal(pantalla.fueraDelTurno, -200, "la devolución va en su renglón");
  assert.equal(pantalla.esperado, 3_800, "el total que se muestra es el del libro");

  // Una pantalla que quedó con el número del turno ($4.000) no cierra: no se asienta otra cosa
  // que la que se confirmó.
  const vieja = await c.cerrarTurno(a, "3300", 4_000);
  assert.equal(vieja?.ok, false);
  assert.match((vieja as { error: string }).error, /ahora es \$ ?3\.800,00, no \$ ?4\.000,00/);
  assert.equal((await c.operatorPrisma.cashSession.findUniqueOrThrow({ where: { id: turno.id } })).status, "OPEN");
  assert.equal((await c.conMarca(a.id, c.marcas.ARQUEO_TURNO_ACTOR_PREFIX)).length, 0, "no se asentó nada");

  // Con la pantalla de hoy: cuenta $3.300, confirma «faltante $500» y eso es lo que queda.
  const confirmado = round2(3_300 - pantalla.esperado);
  assert.equal(confirmado, -500);
  assert.deepEqual(await c.cerrarTurno(a, "3300", pantalla.esperado), { ok: true });
  const cerrado = await c.operatorPrisma.cashSession.findUniqueOrThrow({ where: { id: turno.id } });
  assert.equal(cerrado.closingExpected, pantalla.esperado, "el esperado asentado es el que se mostró");
  assert.equal(cerrado.closingDiff, confirmado, "la diferencia asentada es la que se confirmó");
  const arqueos = await c.conMarca(a.id, c.marcas.ARQUEO_TURNO_ACTOR_PREFIX);
  assert.equal(arqueos.length, 1);
  assert.equal(arqueos[0].amount, 500);

  // B ve su propio cajón, sin nada de A.
  const cajaB = await c.leerCaja(b);
  assert.equal(cajaB.open, null);
  assert.equal(cajaB.esperadoEnElCajon, 7_777);
});
