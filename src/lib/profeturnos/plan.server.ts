// PROFETURNOS · Plan del negocio (T2): lectura del estado y la traba de las mutaciones.
//
// Sin migración (Gate 2), como la vigencia de Factoque (src/lib/facturacion/plan-factoque.server.ts):
//  · `profeturnos.alta` (la deja el alta web): sin ella el negocio es «libre» y nunca se traba;
//  · `profeturnos.plan` {plan, vigenciaHasta}: una fila por cambio (pago, baja, arrepentimiento), la
//    ÚLTIMA manda;
//  · `profeturnos.pago` con entityId = paymentId de MP: la idempotencia del webhook.
// Nunca se borra nada: «vencido» sólo frena lo nuevo (agendar, confirmar, pedidos del turnero).

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import { todayInBusinessTz, dateStrInBusinessTz } from "@/lib/datetime";
import { MENSAJE_VENCIDO, RUTA_MI_PLAN, estadoDelPlan, esFecha, type EstadoDelPlan, type PlanDeLaFila } from "./plan-core";

type TenantTx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

export const ACCION_ALTA = "profeturnos.alta";
export const ACCION_PLAN = "profeturnos.plan";
export const ACCION_PAGO = "profeturnos.pago";
/** Aviso a GSG: devolver a mano lo cobrado (arrepentimiento). No se automatiza la devolución. */
export const ACCION_DEVOLUCION = "profeturnos.devolucion";

export interface FilaPlan {
  plan: PlanDeLaFila | null;
  vigenciaHasta: string | null;
}

/** Lee `{plan, vigenciaHasta}` de los `changes` de una fila `profeturnos.plan` (tolerante a basura). */
export function filaDelPlan(changes: unknown): FilaPlan {
  const c = (changes ?? {}) as { plan?: unknown; vigenciaHasta?: unknown };
  const plan = c.plan === "mensual" || c.plan === "baja" || c.plan === "vencido" ? c.plan : null;
  return { plan, vigenciaHasta: esFecha(c.vigenciaHasta) ? c.vigenciaHasta : null };
}

export interface PlanLeido extends EstadoDelPlan {
  altaEn: string | null;
  fila: FilaPlan;
}

/** El plan dentro de una transacción del negocio (la del webhook o la del trámite, con su candado). */
export async function planEnTx(tx: TenantTx, tenantId: string, hoy: string): Promise<PlanLeido> {
  const [alta, ultima] = await Promise.all([
    tx.auditLog.findFirst({
      where: { tenantId, action: ACCION_ALTA, entity: "Tenant", entityId: tenantId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { createdAt: true },
    }),
    tx.auditLog.findFirst({
      where: { tenantId, action: ACCION_PLAN, entity: "Tenant", entityId: tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { changes: true },
    }),
  ]);
  const altaEn = alta ? dateStrInBusinessTz(alta.createdAt) : null;
  const fila = filaDelPlan(ultima?.changes);
  return { ...estadoDelPlan({ altaEn, vigenciaHasta: fila.vigenciaHasta, plan: fila.plan, hoy }), altaEn, fila };
}

/** Lo mismo, en una transacción propia (pantallas, traba). */
export async function leerPlan(tenantId: string, hoy: string = todayInBusinessTz()): Promise<PlanLeido> {
  return tenantTransaction((tx) => planEnTx(tx, tenantId, hoy), { tenantId });
}

export type PlanVigente = { ok: true } | { ok: false; error: string; enlace: string };

/**
 * La traba de las mutaciones del panel: «vencido» → rechazo con el mensaje y el link a «Mi plan».
 * Prueba, activo y libre pasan. Si la lectura falla, NO se traba (un error nuestro no le corta el
 * trabajo al profe): sólo frena un vencimiento leído.
 */
export async function exigirPlanVigente(tenantId: string, hoy?: string): Promise<PlanVigente> {
  let plan: PlanLeido;
  try {
    plan = await leerPlan(tenantId, hoy);
  } catch {
    return { ok: true };
  }
  return plan.estado === "vencido" ? { ok: false, error: MENSAJE_VENCIDO, enlace: RUTA_MI_PLAN } : { ok: true };
}

/** ¿El turnero público toma pedidos nuevos? (false sólo con el plan vencido.) */
export async function turneroTomaPedidos(tenantId: string, hoy?: string): Promise<boolean> {
  return (await exigirPlanVigente(tenantId, hoy)).ok;
}
