// ============================================================================
// HORAS DEL TALLER EN LA BASE (T3 · taller de Ale): la base misma rechaza una carga de horas o un valor hora con la
// persona o el proyecto de otro negocio (FK compuestas), y el doble clic (mismo token de formulario) deja UNA sola
// carga. Corre contra una base efímera local (saltea sin Postgres fuera de CI).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

const fk = (e: unknown) => /foreign key|P2003/i.test(String((e as { code?: string }).code ?? "") + String(e));

test("horas: persona/proyecto de otro negocio rechazados y doble envío = una carga", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const db = await prismaComoDuenio(base);
  const A = base.a.id;
  const B = base.b.id;
  const enNegocio = <T>(tenantId: string, fn: (tx: typeof db) => Promise<T>) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as typeof db);
    });

  const proyA = await db.proyecto.create({ data: { tenantId: A, clientId: base.a.clientes[0], numero: 1, nombre: "Stand", servicio: "EVENTOS" }, select: { id: true } });
  const perA = await enNegocio(A, (tx) => tx.proyectoPersona.create({ data: { tenantId: A, nombre: "Ale" }, select: { id: true } }));
  const perB = await enNegocio(B, (tx) => tx.proyectoPersona.create({ data: { tenantId: B, nombre: "Otra" }, select: { id: true } }));
  const fecha = new Date("2026-11-09T00:00:00Z");

  await assert.rejects(enNegocio(A, (tx) => tx.tallerValorHora.create({ data: { tenantId: A, personaId: perB.id, valorHora: 1, vigenteDesde: fecha } })), fk, "valor hora de una persona ajena");
  await assert.rejects(enNegocio(A, (tx) => tx.tallerHora.create({ data: { tenantId: A, proyectoId: proyA.id, personaId: perB.id, fecha, horas: 1, valorHoraSnap: 1 } })), fk, "horas de una persona ajena");

  // Doble clic: dos envíos simultáneos con el mismo token → una fila; el segundo choca con el único (P2002).
  const cargar = () => enNegocio(A, (tx) => tx.tallerHora.create({ data: { tenantId: A, proyectoId: proyA.id, personaId: perA.id, fecha, horas: 8, valorHoraSnap: 5000, envioId: "tok-1" } }));
  const r = await Promise.allSettled([cargar(), cargar()]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(await enNegocio(A, (tx) => tx.tallerHora.count()), 1);
  // Sin token (NULL) no choca: cargas distintas siguen entrando.
  await enNegocio(A, (tx) => tx.tallerHora.create({ data: { tenantId: A, proyectoId: proyA.id, personaId: perA.id, fecha, horas: 1, valorHoraSnap: 5000 } }));
  await enNegocio(A, (tx) => tx.tallerHora.create({ data: { tenantId: A, proyectoId: proyA.id, personaId: perA.id, fecha, horas: 1, valorHoraSnap: 5000 } }));
  assert.equal(await enNegocio(A, (tx) => tx.tallerHora.count()), 3);
  // Y B no ve las horas de A (FORCE RLS).
  assert.equal(await enNegocio(B, (tx) => tx.tallerHora.count()), 0);
});
