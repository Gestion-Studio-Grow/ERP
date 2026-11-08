// ============================================================================
// BOTÓN DE ARREPENTIMIENTO Y BOTÓN DE BAJA DE FACTOQUE — contra Postgres (base efímera, app_rls)
// ============================================================================
//  · Con sesión (Mi cuenta): Plus → Gratis en el acto, fila `factoque.plan` (como «Cambiar plan» del
//    operador) + fila del trámite; el tope que rige pasa a 5. Otra vez: «ya era Gratis».
//  · Público (sin cuenta) con el CUIT de un negocio Factoque: sólo REGISTRA, no cambia el plan.
//  · Público con un CUIT que no es de nadie: número igual, nada en ninguna base.
//  · Aislamiento: el trámite de B no deja filas en A.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { prepararAccionesDeServidor } from "@/test/accion-de-servidor";

test("trámites de Factoque: baja con sesión vuelve a Gratis; arrepentimiento público sólo registra", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const { registrarTramite } = await import("@/lib/factoque-tramites.server");
  const { leerPlanFactoque } = await import("@/lib/facturacion/plan-factoque.server");
  const duenio = await prismaComoDuenio(base);
  const B = base.b.id;
  const hoy = "2026-11-08";
  await duenio.tenant.update({ where: { id: B }, data: { blueprintId: "facturita", plan: "factoque-plus", arcaCuit: "20111111112" } });
  const datos = { email: "ana@yoga.com", cuit: "20111111112", motivo: "ya no lo uso" };
  const filas = (action: string) => duenio.auditLog.findMany({ where: { tenantId: B, action }, orderBy: { createdAt: "asc" } });

  // Público (sin sesión) con el CUIT de B: registra en B y NO toca el plan.
  const pub = await registrarTramite("arrepentimiento", datos, null, hoy);
  assert.equal(pub.efecto, "registrado");
  assert.equal(pub.tenantId, B);
  assert.match(pub.numero, /^ARR-20261108-/);
  assert.equal((await duenio.tenant.findUniqueOrThrow({ where: { id: B } })).plan, "factoque-plus", "sin sesión no se cambia el plan de nadie");
  const arr = await filas("factoque.arrepentimiento");
  assert.equal(arr.length, 1);
  assert.equal(arr[0].channel, "public");
  assert.equal(arr[0].actor, "publico:ana@yoga.com");
  assert.equal((arr[0].changes as { tramite: string }).tramite, pub.numero);

  // Con sesión: baja → Gratis en el acto, con la fila del plan y la del trámite.
  const baja = await registrarTramite("baja", datos, { tenantId: B, userId: base.b.duenia.id }, hoy);
  assert.equal(baja.efecto, "plan_a_gratis");
  assert.equal((await duenio.tenant.findUniqueOrThrow({ where: { id: B } })).plan, null);
  const planFilas = await filas("factoque.plan");
  assert.equal(planFilas.length, 1);
  assert.deepEqual((planFilas[0].changes as { despues: unknown }).despues, { plan: null, vigenciaHasta: null });
  assert.equal((await filas("factoque.baja")).length, 1);
  assert.equal((await leerPlanFactoque(B, hoy))?.cupo.tope, 5, "el tope que rige vuelve a 5");

  // Otra vez: ya estaba en Gratis; no escribe otra fila de plan.
  const otra = await registrarTramite("baja", datos, { tenantId: B, userId: base.b.duenia.id }, hoy);
  assert.equal(otra.efecto, "ya_era_gratis");
  assert.equal((await filas("factoque.plan")).length, 1);

  // CUIT de nadie: número igual, ninguna fila.
  const antes = await duenio.auditLog.count();
  const nadie = await registrarTramite("baja", { ...datos, cuit: "20222222223" }, null, hoy);
  assert.equal(nadie.tenantId, null);
  assert.match(nadie.numero, /^BAJ-/);
  assert.equal(await duenio.auditLog.count(), antes);

  // Aislamiento: nada de esto quedó en A.
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, action: { startsWith: "factoque." } } }), 0);

  // Con sesión en un negocio que NO es Factoque: no se registra.
  await assert.rejects(registrarTramite("baja", datos, { tenantId: base.a.id, userId: base.a.duenia.id }, hoy), /producto Factoque/);
});
