// ADR-101 · días cerrados inmutables; diferencia real al abrir y al arquear, una vez cada una; un
// movimiento en efectivo sin turno cuenta igual para el turno y para el día. Arnés: un-solo-esperado.arnes.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest } from "@/test/base-efimera";
import { preparar } from "@/lib/caja/un-solo-esperado.arnes";

test("contra Postgres: los días cerrados no se tocan; la diferencia real al abrir y la del arqueo quedan una vez cada una; lo que no pasó por el turno también cuenta", async (t) => {
  const laBase = await baseEfimeraParaElTest(t);
  if (!laBase) return;
  const c = await preparar(laBase);
  const { a, b } = laBase;

  await c.operatorPrisma.cashMovement.createMany({
    data: [
      { tenantId: a.id, type: "VENTA", method: "EFECTIVO", amount: 5_000, occurredAt: c.alMediodia(c.ayer), createdBy: "seed" },
      { tenantId: b.id, type: "VENTA", method: "EFECTIVO", amount: 7_777, occurredAt: c.alMediodia(c.ayer), createdBy: "seed" },
    ],
  });
  // Ayer se cerró con $5.000 contados: cuadra y queda congelado.
  const ayer = await c.cerrarElDia(a, c.ayer, "5000");
  assert.equal(ayer?.ok, true, JSON.stringify(ayer));
  const libroHastaAyer = await c.fotoDelLibro(a.id, c.inicioDeHoy);
  const cierresDeAyer = await c.operatorPrisma.auditLog.findMany({ where: { tenantId: a.id, entityId: c.ayer }, orderBy: { id: "asc" } });
  assert.equal(cierresDeAyer.length, 1);
  const libroDeB = await c.fotoDelLibro(b.id);

  // A la mañana hay $4.000: faltan $1.000 que el libro da por presentes. Se asienta al abrir.
  assert.deepEqual(await c.abrir(a, "4000"), { ok: true });
  const turno = await c.operatorPrisma.cashSession.findFirstOrThrow({ where: { tenantId: a.id, status: "OPEN" } });
  const aperturas = await c.conMarca(a.id, c.marcas.APERTURA_TURNO_ACTOR_PREFIX);
  assert.equal(aperturas.length, 1);
  assert.equal(aperturas[0].type, "EGRESO");
  assert.equal(aperturas[0].amount, 1_000);
  assert.ok(aperturas[0].occurredAt >= c.inicioDeHoy, "la diferencia va con fecha de hoy, no dentro del día cerrado");

  // Una reversa de un cobro en efectivo que NO pasó por este turno (sin `sessionId`): sale
  // plata del cajón igual. Antes el turno no la veía y el día sí.
  await c.operatorPrisma.cashMovement.create({
    data: { tenantId: a.id, sessionId: null, type: "EGRESO", method: "EFECTIVO", amount: 200, reason: "reversa", createdBy: "anulacion-turno:user:x" },
  });

  // Al cerrar cuenta $3.300: el libro espera $3.800 ⇒ faltante real de $500, asentado una vez.
  assert.deepEqual(await c.cerrarTurno(a, "3300"), { ok: true });
  const cerrado = await c.operatorPrisma.cashSession.findUniqueOrThrow({ where: { id: turno.id } });
  assert.equal(cerrado.closingExpected, 3_800);
  assert.equal(cerrado.closingCounted, 3_300);
  assert.equal(cerrado.closingDiff, -500);
  const arqueos = await c.conMarca(a.id, c.marcas.ARQUEO_TURNO_ACTOR_PREFIX);
  assert.equal(arqueos.length, 1);
  assert.equal(arqueos[0].type, "EGRESO");
  assert.equal(arqueos[0].amount, 500);

  // El día con el mismo cajón cuadra: turno y día esperan lo mismo.
  const hoy = await c.cerrarElDia(a, c.hoy, "3300");
  assert.equal(hoy?.ok, true, JSON.stringify(hoy));
  assert.match((hoy as { message: string }).message, /No hubo diferencias\./);

  // El día cerrado ayer quedó intacto: mismas filas, mismos importes, mismo registro de cierre.
  assert.deepEqual(await c.fotoDelLibro(a.id, c.inicioDeHoy), libroHastaAyer, "el libro de ayer no se tocó");
  assert.deepEqual(
    await c.operatorPrisma.auditLog.findMany({ where: { tenantId: a.id, entityId: c.ayer }, orderBy: { id: "asc" } }),
    cierresDeAyer,
    "el cierre de ayer no se tocó",
  );
  assert.deepEqual(await c.fotoDelLibro(b.id), libroDeB, "el libro de B quedó igual");
});
