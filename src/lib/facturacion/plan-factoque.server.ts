// ============================================================================
// PLAN DE FACTOQUE DEL NEGOCIO — de dónde sale el tope mensual (T2, PLAN-SALIDA-2026-11 §2)
// ============================================================================
//
// Fuente: `Tenant.plan` (columna que ya existe; Gratis = nulo u otro valor) más la vigencia que
// carga el operador al cambiarlo. La vigencia NO tiene columna (Gate 2: sin migración) y
// `BusinessSettings` no tiene un campo json: vive en la fila de auditoría del cambio de plan
// (`ACCION_PLAN_FACTOQUE`), la última manda. Si la última fila no corresponde al plan que tiene la
// columna (el plan se escribió por otra puerta), no hay vigencia: el plan corre sin vencimiento.
//
// Sólo los negocios del blueprint `facturita` tienen tope; el resto de los negocios usa
// `Tenant.plan` para el catálogo general (src/planes/catalogo.ts) y no se toca.

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import { planFactoqueEnTx, type PlanFactoqueDelNegocio } from "@/lib/facturacion/plan-factoque-en-tx";

// La lectura en transacción vive en `plan-factoque-en-tx.ts` (sin "server-only"); acá se re-exporta.
export {
  ACCION_PLAN_FACTOQUE,
  BLUEPRINT_CON_TOPE,
  planFactoqueEnTx,
  vigenciaDeLaFila,
  type PlanFactoqueDelNegocio,
} from "@/lib/facturacion/plan-factoque-en-tx";

/** Lo mismo, en una transacción propia (pantallas). */
export async function leerPlanFactoque(tenantId: string, hoy: string): Promise<PlanFactoqueDelNegocio | null> {
  return tenantTransaction((tx) => planFactoqueEnTx(tx, tenantId, hoy), { tenantId });
}
