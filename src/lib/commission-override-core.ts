// Núcleo del override de comisión por (profesional, servicio) — G18.
//
// Vive fuera de `catalog-actions.ts` ("use server") a propósito: así se puede
// exportar tipo y lógica sincrónica, y sobre todo se puede testear el aislamiento
// multi-tenant con un store falso, sin DB (mismo patrón que `order-core.ts`).
//
// POR QUÉ EXISTE (hallazgo lateral de la verificación adversarial del 11/08/2026):
// el bloque original filtraba SOLO por la clave compuesta (professionalId,
// serviceId), que en el schema es `@@unique` GLOBAL — no por tenant. Un
// professionalId de otro tenant llegado por formData escribía la fila de ESE otro
// tenant. Hoy eso lo frena RLS (rol app_rls NOBYPASSRLS, enforced en prod), pero
// la defensa en profundidad del proyecto pide el predicado también en la capa de
// aplicación: si mañana una ruta corre con un rol que bypassea RLS, o si RLS se
// relaja para un mantenimiento, esta escritura cruza tenants. Cuatro clientes
// comparten una sola base Postgres ⇒ el impacto sería cross-tenant.
//
// POR QUÉ NO ES UN `upsert`: el `where` de un upsert admite el filtro extra de
// tenant (extendedWhereUnique), pero cuando el par pertenece a OTRO tenant el
// filtro no matchea, Prisma cae al create y choca contra el unique global con un
// P2002 crudo — indistinguible de una carrera legítima del mismo tenant. Acá el
// update-or-create es explícito: el `updateMany` lleva el predicado de tenant, y
// el P2002 del create se reintenta como update scopeado; si TAMPOCO matchea,
// entonces sí la fila es de otro tenant y falla cerrado (ADR-015) con un error de
// negocio que no filtra detalle.

/** Identidad completa de un override: nunca se escribe sin las tres partes. */
export type CommissionOverrideScope = {
  tenantId: string;
  professionalId: string;
  serviceId: string;
};

/**
 * Subconjunto mínimo del delegate de Prisma que este núcleo usa. Es un puerto:
 * en runtime se le pasa `prisma.professionalServiceCommission`; en los tests, un
 * store en memoria que modela los mismos predicados y el mismo unique global.
 */
export type CommissionOverrideStore = {
  deleteMany(args: { where: CommissionOverrideScope }): Promise<{ count: number }>;
  updateMany(args: {
    where: CommissionOverrideScope;
    data: { commissionPercent: number };
  }): Promise<{ count: number }>;
  create(args: {
    data: CommissionOverrideScope & { commissionPercent: number };
  }): Promise<unknown>;
};

/** Mensaje único de la falla cerrada. No filtra qué tenant es dueño de la fila. */
export const CROSS_TENANT_COMMISSION_ERROR =
  "No se pudo guardar la comisión: ese profesional o ese servicio no pertenecen a este negocio.";

/** P2002 de Prisma (unique constraint) detectado por forma, sin importar el cliente. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: unknown }).code === "P2002"
  );
}

/**
 * Borra el override (vuelve a la comisión general del profesional). Acotado al
 * tenant: si el par es de otro tenant, borra 0 filas y no toca nada.
 */
export async function clearCommissionOverride(
  store: CommissionOverrideStore,
  scope: CommissionOverrideScope,
): Promise<{ count: number }> {
  return store.deleteMany({ where: scope });
}

/**
 * Guarda el override. Update-or-create acotado al tenant (ver cabecera). Devuelve
 * qué pasó, para que el llamador audite. Lanza `CROSS_TENANT_COMMISSION_ERROR` si
 * la fila existe pero es de otro tenant.
 */
export async function setCommissionOverride(
  store: CommissionOverrideStore,
  scope: CommissionOverrideScope,
  commissionPercent: number,
): Promise<"updated" | "created"> {
  const updated = await store.updateMany({ where: scope, data: { commissionPercent } });
  if (updated.count > 0) return "updated";

  try {
    await store.create({ data: { ...scope, commissionPercent } });
    return "created";
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // Chocó el unique global. Dos causas posibles: (a) carrera con otra escritura
    // del MISMO tenant que insertó entremedio → el update ahora sí matchea; (b) la
    // fila es de otro tenant → no matchea y falla cerrado.
    const retry = await store.updateMany({ where: scope, data: { commissionPercent } });
    if (retry.count === 0) throw new Error(CROSS_TENANT_COMMISSION_ERROR);
    return "updated";
  }
}
