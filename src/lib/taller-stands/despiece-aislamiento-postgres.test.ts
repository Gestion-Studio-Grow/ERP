// ============================================================================
// AISLAMIENTO DEL DESPIECE EN LA BASE (T2 · taller de Ale): la base misma, con FKs compuestas
// (id, tenantId), rechaza un despiece que mezcle la pieza o el proyecto de otro negocio, aunque un bug
// del servidor se saltee el filtro por tenantId. Corre contra una base efímera local (saltea sin Postgres
// fuera de CI).
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";

test("un despiece no puede usar la pieza ni el proyecto de otro negocio (FK compuesta)", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  const db = await prismaComoDuenio(base);
  const A = base.a.id;
  const B = base.b.id;

  // Las tablas del taller tienen FORCE RLS: hasta el dueño escribe parado en el negocio.
  const enNegocio = <T>(tenantId: string, fn: (tx: typeof db) => Promise<T>) =>
    db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx as unknown as typeof db);
    });

  const proyecto = async (tenantId: string, clientId: string) =>
    db.proyecto.create({ data: { tenantId, clientId, numero: 1, nombre: "Stand", servicio: "EVENTOS" }, select: { id: true } });
  const proyA = await proyecto(A, base.a.clientes[0]);
  const proyB = await proyecto(B, base.b.clientes[0]);
  const piezaA = await enNegocio(A, (tx) => tx.tallerPieza.create({ data: { tenantId: A, nombre: "Panel", costoUnit: 100 }, select: { id: true } }));
  const piezaB = await enNegocio(B, (tx) => tx.tallerPieza.create({ data: { tenantId: B, nombre: "Panel B", costoUnit: 90 }, select: { id: true } }));

  // Lo legítimo entra.
  await enNegocio(B, (tx) => tx.tallerDespiece.create({ data: { tenantId: B, proyectoId: proyB.id, piezaId: piezaB.id, cantidad: 2, costoUnitSnap: 90 } }));

  // La pieza de A en un despiece de B: la base lo rechaza.
  await assert.rejects(
    enNegocio(B, (tx) => tx.tallerDespiece.create({ data: { tenantId: B, proyectoId: proyB.id, piezaId: piezaA.id, cantidad: 1, costoUnitSnap: 0 } })),
    (e: unknown) => /foreign key|P2003/i.test(String((e as { code?: string }).code ?? "") + String(e)),
    "una pieza de otro negocio no entra",
  );
  // El proyecto de A con una pieza de B, parado en B: también rechazado.
  await assert.rejects(
    enNegocio(B, (tx) => tx.tallerDespiece.create({ data: { tenantId: B, proyectoId: proyA.id, piezaId: piezaB.id, cantidad: 1, costoUnitSnap: 0 } })),
    (e: unknown) => /foreign key|P2003/i.test(String((e as { code?: string }).code ?? "") + String(e)),
    "un proyecto de otro negocio no entra",
  );

  // Y parado en B no se ve nada de A (FORCE RLS).
  assert.equal(await enNegocio(B, (tx) => tx.tallerPieza.count({ where: { id: piezaA.id } })), 0);
  assert.equal(await enNegocio(B, (tx) => tx.tallerDespiece.count()), 1);
});
