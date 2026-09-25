// El tope de facturas automáticas del plan llega a los caminos que emiten (integración R3-F3 → Bancos).
// Contra Postgres efímero con RLS: kpisFacturacionBancaria corre su propia transacción con el negocio
// puesto y lee el tope con el mismo helper que emitirPropuestas, bancos-actions y mercadopago-auto.

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

test("Bancos: un Micro que se carga 100.000 facturas en su panel ve y usa el tope del plan; la excepción de GSG manda", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { PLANES } = await import("@/planes/catalogo");
  const { kpisFacturacionBancaria } = await import("@/lib/bancos-glue");
  const A = base.a.id;
  const topeMicro = PLANES.micro.limites.facturasAutomaticasMes;
  assert.equal(typeof topeMicro, "number");
  await sql(base, `UPDATE "Tenant" SET plan = 'micro', "bancosCapFacturasMes" = 100000 WHERE id = $1`, [A]);
  assert.equal((await kpisFacturacionBancaria(A)).capFacturasMes, topeMicro);
  // GSG baja el tope a 0 desde la consola: la columna del negocio (100.000) no lo sube.
  await sql(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, channel, "createdAt")
     VALUES ('ajuste-cero', $1, 'operator:prueba', 'limite.ajustar', 'LimiteDelPlan', 'facturasAutomaticasMes', '{"plan":"micro","valor":0}'::jsonb, 'operador', now() + interval '1 second')`,
    [A],
  );
  const k = await kpisFacturacionBancaria(A);
  assert.equal(k.capFacturasMes, 0);
  assert.equal(k.capRestante, 0);
});

test("Bancos: sin plan del catálogo (como CH) el tope es el de siempre, la columna o 159", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const { kpisFacturacionBancaria } = await import("@/lib/bancos-glue");
  const { CAP_FACTURAS_MES_DEFAULT } = await import("@/plugins/bancos/domain/reglas");
  const B = base.b.id;
  await sql(base, `UPDATE "Tenant" SET plan = NULL, "bancosCapFacturasMes" = NULL WHERE id = $1`, [B]);
  assert.equal((await kpisFacturacionBancaria(B)).capFacturasMes, CAP_FACTURAS_MES_DEFAULT);
  await sql(base, `UPDATE "Tenant" SET "bancosCapFacturasMes" = 300 WHERE id = $1`, [B]);
  assert.equal((await kpisFacturacionBancaria(B)).capFacturasMes, 300);
});
