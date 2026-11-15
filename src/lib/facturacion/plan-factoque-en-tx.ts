// ============================================================================
// PLAN DE FACTOQUE DEL NEGOCIO, leído en una transacción (sin "server-only")
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

// Separado de `plan-factoque.server.ts` (que lo re-exporta) para que la emisión AUTOMÁTICA
// (`bancos-glue`, que corre también en scripts y tests sin los dobles de Next) cuente el cupo del
// plan con el mismo candado que la manual (GSG-FACT-011 · H7).

import type { Prisma } from "@/generated/prisma/client";
import type { CupoDelPlan } from "@/lib/facturita-core";
import { cupoDelPlan, planFactoqueEfectivo, type PlanEfectivo } from "@/lib/facturita-planes";

type Tx = Prisma.TransactionClient;

/** El blueprint con tope mensual de comprobantes (Factoque). */
export const BLUEPRINT_CON_TOPE = "facturita";

/** Acción de la fila de auditoría del «Cambiar plan» de Factoque (la escribe la consola del operador). */
export const ACCION_PLAN_FACTOQUE = "factoque.plan";

export interface PlanFactoqueDelNegocio extends PlanEfectivo {
  cupo: CupoDelPlan;
}

/** La vigencia guardada en la fila de auditoría, si corresponde al plan de la columna. */
export function vigenciaDeLaFila(changes: unknown, planDeLaColumna: string | null): string | null {
  const despues = (changes as { despues?: { plan?: unknown; vigenciaHasta?: unknown } } | null)?.despues;
  if (!despues || despues.plan !== planDeLaColumna) return null;
  return typeof despues.vigenciaHasta === "string" ? despues.vigenciaHasta : null;
}

/**
 * El plan que rige hoy, leído en la transacción que se le pase (la del cupo, con su candado).
 * `null` = el negocio no es Factoque: no tiene tope.
 */
export async function planFactoqueEnTx(tx: Tx, tenantId: string, hoy: string): Promise<PlanFactoqueDelNegocio | null> {
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true, plan: true } });
  if (t?.blueprintId !== BLUEPRINT_CON_TOPE) return null;
  const fila = await tx.auditLog.findFirst({
    where: { tenantId, action: ACCION_PLAN_FACTOQUE, entity: "Tenant", entityId: tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { changes: true },
  });
  const efectivo = planFactoqueEfectivo(t.plan, vigenciaDeLaFila(fila?.changes, t.plan), hoy);
  return { ...efectivo, cupo: cupoDelPlan(efectivo.plan) };
}
