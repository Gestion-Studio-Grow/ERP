// ============================================================================
// TEST DE FORMA — una migración que crea una tabla de tenant tiene que prenderle RLS.
// ============================================================================
//
// Qué encontró la auditoría: de las 21 migraciones que crean una tabla con `tenantId`,
// NINGUNA prende Row Level Security. No fue un leak porque `prisma/rls/0001_enable_rls.sql`
// es data-driven —le pone policy a toda tabla que tenga `tenantId`— y se re-corría después
// de cada tanda. Pero eso deja el aislamiento dependiendo de que alguien se acuerde: entre
// `prisma migrate deploy` y el re-run de 0001, la tabla nueva existe SIN policy en una base
// con cuatro negocios adentro.
//
// Este test cierra la clase para adelante. Las ya aplicadas quedan exentas con nombre y
// propio y motivo —no se pueden editar sin re-aplicar historia— y las cubre el re-run de
// 0001, que el runbook de migración ahora exige como paso.
//
// Mismo patrón que `MODELOS_SIN_TENANT` en `tenant-scope.test.ts`: una lista explícita que
// hay que tocar a mano, y un test que se pone rojo si alguien agrega algo sin pensarlo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = "prisma/migrations";

/**
 * Migraciones que crean tablas de tenant SIN emitir la policy, y que ya están aplicadas
 * (o forman parte de la historia inmutable). Las cubre el re-run de `0001_enable_rls.sql`.
 *
 * ⚠️ Esta lista NO CRECE. Una migración nueva emite su propia policy — ver
 * `20260815120000_lead_campania/migration.sql` como referencia.
 */
const EXENTAS_POR_HISTORIA = new Set([
  "20260702221903_add_service_category",
  "20260702225931_wave2_blocks_commissions_resources",
  "20260703061812_add_reminder_panel",
  "20260703160232_deposit_and_coupons",
  "20260703170000_add_users_rbac",
  "20260704120000_add_business_settings",
  "20260704130000_add_commission_payouts",
  "20260704140000_add_waitlist",
  "20260704160000_add_invoice_outbox",
  "20260704180000_add_pos_orders",
  "20260705124318_add_cash_register",
  "20260705140000_add_stock_purchases",
  "20260705150000_add_stock_ledger",
  "20260708230000_add_supplier_master",
  "20260708230100_add_collection_settlement",
  "20260709000000_add_account_payable",
  "20260709000100_add_account_receivable",
  "20260711120000_add_bancos_importacion",
  "20260711140000_add_cartera_cliente",
  "20260711140000_add_tenant_fiscal_credential",
]);

type Creada = { migracion: string; tabla: string; prendeRls: boolean };

function tablasDeTenantCreadas(): Creada[] {
  if (!existsSync(DIR)) return [];
  const out: Creada[] = [];
  for (const dir of readdirSync(DIR).sort()) {
    const sql = join(DIR, dir, "migration.sql");
    if (!existsSync(sql)) continue;
    const s = readFileSync(sql, "utf8");
    for (const m of s.matchAll(/CREATE TABLE\s+"(\w+)"\s*\(([\s\S]*?)\n\);/g)) {
      const [, tabla, cuerpo] = m;
      if (!/"tenantId"/.test(cuerpo)) continue;
      const prendeRls = new RegExp(`ENABLE ROW LEVEL SECURITY[\\s\\S]*?"${tabla}"|"${tabla}"[\\s\\S]*?ENABLE ROW LEVEL SECURITY`).test(s);
      out.push({ migracion: dir, tabla, prendeRls });
    }
  }
  return out;
}

test("toda migración NUEVA que cree una tabla con tenantId le prende RLS", () => {
  const sinRls = tablasDeTenantCreadas()
    .filter((c) => !c.prendeRls && !EXENTAS_POR_HISTORIA.has(c.migracion));
  assert.deepEqual(
    sinRls.map((c) => `${c.migracion} → ${c.tabla}`),
    [],
    "Una tabla con tenantId sin policy es un leak entre los cuatro negocios mientras no se " +
      "re-corra 0001_enable_rls.sql. Emití la policy en la propia migración (copiá el bloque " +
      "de 20260815120000_lead_campania) o, si la migración ya se aplicó, agregala a " +
      "EXENTAS_POR_HISTORIA con su motivo.",
  );
});

test("la lista de exentas no crece sola: toda exenta tiene que existir en el árbol", () => {
  const existentes = new Set(readdirSync(DIR));
  const fantasmas = [...EXENTAS_POR_HISTORIA].filter((m) => !existentes.has(m));
  assert.deepEqual(fantasmas, [], "hay exentas que ya no existen: sacalas de la lista");
});

test("la migración pendiente de leads sí emite su policy", () => {
  const c = tablasDeTenantCreadas().find((x) => x.tabla === "LeadCampania");
  assert.ok(c, "LeadCampania tiene que seguir creándose en una migración");
  assert.equal(c.prendeRls, true, "LeadCampania guarda teléfono y consentimiento: no puede nacer sin policy");
});
