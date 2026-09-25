// Uso del plan contra Postgres con RLS (R3-F3): el tope de facturas automáticas y lo que lee "Tu plan".

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

async function sql(base: BaseEfimera, q: string, v: unknown[] = []) {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await c.query(q, v);
  } finally {
    await c.end();
  }
}

async function capDe(base: BaseEfimera, tenantId: string): Promise<number> {
  const { tenantTransaction } = await import("@/lib/rls");
  const { capFacturasMesDelNegocioEnTx } = await import("@/lib/uso-del-plan");
  return tenantTransaction(
    async (tx) => {
      const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { bancosCapFacturasMes: true } });
      return capFacturasMesDelNegocioEnTx(tx, tenantId, t?.bancosCapFacturasMes);
    },
    { tenantId },
  );
}

test("un Micro que se carga 100.000 facturas desde su panel sigue con el tope del plan; sólo GSG da más", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { PLANES } = await import("@/planes/catalogo");
  const A = base.a.id;
  const topeMicro = PLANES.micro.limites.facturasAutomaticasMes;
  assert.equal(typeof topeMicro, "number");
  // Lo que escribe guardarConfigBancosAction desde /admin: la columna, hasta 100.000.
  await sql(base, `UPDATE "Tenant" SET plan = 'micro', "bancosCapFacturasMes" = 100000 WHERE id = $1`, [A]);
  assert.equal(await capDe(base, A), topeMicro);
  // Una fila con forma de ajuste escrita desde el panel (canal admin) tampoco sube el tope.
  await sql(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel)
     VALUES ('forjada-f', $1, 'user:dueno', 'limite.ajustar', 'LimiteDelPlan', 'facturasAutomaticasMes', '{"plan":"micro","valor":100000}'::jsonb, 'admin')`,
    [A],
  );
  assert.equal(await capDe(base, A), topeMicro);
  // El ajuste de GSG desde la consola sí sube el tope; la columna del negocio igual puede bajarlo.
  await sql(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel, "createdAt")
     VALUES ('ajuste-f', $1, 'operator:prueba', 'limite.ajustar', 'LimiteDelPlan', 'facturasAutomaticasMes', '{"plan":"micro","valor":500}'::jsonb, 'operador', now() + interval '1 second')`,
    [A],
  );
  assert.equal(await capDe(base, A), 500);
  await sql(base, `UPDATE "Tenant" SET "bancosCapFacturasMes" = 300 WHERE id = $1`, [A]);
  assert.equal(await capDe(base, A), 300);
});

test("sin plan del catálogo y en CH, el tope de facturas es el de siempre (la columna o 159)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { CAP_FACTURAS_MES_DEFAULT } = await import("@/plugins/bancos/domain/reglas");
  const B = base.b.id;
  await sql(base, `UPDATE "Tenant" SET plan = NULL, "bancosCapFacturasMes" = NULL WHERE id = $1`, [B]);
  assert.equal(await capDe(base, B), CAP_FACTURAS_MES_DEFAULT);
  await sql(base, `UPDATE "Tenant" SET slug = 'beauty-spa', plan = 'micro', "bancosCapFacturasMes" = 300 WHERE id = $1`, [B]);
  assert.equal(await capDe(base, B), 300, "CH sigue con su columna, sin el tope nuevo");
  await sql(base, `UPDATE "Tenant" SET slug = $2 WHERE id = $1`, [B, base.b.slug]);
});

test("«Tu plan» lee el plan, las personas activas y los comprobantes del mes del negocio, sin mirar al vecino", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { leerTuPlan } = await import("@/lib/uso-del-plan");
  const A = base.a.id;
  const B = base.b.id;
  await sql(base, `UPDATE "Tenant" SET plan = 'micro' WHERE id = $1`, [A]);
  await sql(base, `UPDATE "Tenant" SET plan = NULL WHERE id = $1`, [B]);
  const activosA = Number((await sql(base, `SELECT count(*)::int AS n FROM "User" WHERE "tenantId" = $1 AND active AND "deletedAt" IS NULL`, [A])).rows[0].n);
  const a = await leerTuPlan(A);
  assert.ok(a);
  assert.equal(a.limites.plan, "micro");
  assert.equal(a.uso.usuarios, activosA);
  assert.equal(typeof a.uso.comprobantesMes, "number");
  const b = await leerTuPlan(B);
  assert.ok(b);
  assert.equal(b.limites.plan, null);
  assert.deepEqual(b.uso, {}, "sin plan no se cuenta nada");
  assert.equal(await leerTuPlan("no-existe"), null);
});
