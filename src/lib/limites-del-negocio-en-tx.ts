// ============================================================================
// LÍMITES DEL NEGOCIO LEÍDOS DENTRO DE UNA TRANSACCIÓN (R3-F3)
// ============================================================================
//
// Sin "use server" y sin depender de bancos-glue: lo usan el tope de usuarios, la pantalla
// "Tu plan" (vía uso-del-plan.ts) y los caminos que emiten facturas automáticas (bancos-glue,
// bancos-actions, mercadopago-auto). Se separó de uso-del-plan.ts para que bancos-glue lo pueda
// importar sin armar un ciclo (uso-del-plan importa filtrosFacturacionMes de bancos-glue).
// Siempre con el `tx` de `tenantTransaction` (RLS con el negocio puesto).

import type { tenantTransaction } from "@/lib/rls";
import { filtroDeExcepcionesValidas, limitesDelNegocio, TOPE_MAXIMO, type LimitesDelNegocio } from "@/planes/limites";
import { capFacturasMesEfectivo } from "@/plugins/bancos/domain/reglas";

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** Los límites del negocio (plan + excepciones válidas de la consola), o `null` si no existe. */
export async function leerLimitesEnTx(tx: Tx, tenantId: string): Promise<{ slug: string; nombre: string; limites: LimitesDelNegocio } | null> {
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, plan: true, name: true } });
  if (!t) return null;
  const filas = await tx.auditLog.findMany({
    where: filtroDeExcepcionesValidas(tenantId),
    select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, changes: true, createdAt: true },
  });
  return { slug: t.slug, nombre: t.name, limites: limitesDelNegocio(t, filas) };
}

/**
 * El tope de facturas automáticas que vale este mes: el del plan (o la excepción de GSG), que la
 * columna del negocio (`Tenant.bancosCapFacturasMes`, editable desde su panel) sólo puede bajar.
 * Sin plan del catálogo (CH): la columna o 159, como siempre.
 */
export async function capFacturasMesDelNegocioEnTx(tx: Tx, tenantId: string, columna: number | null | undefined): Promise<number> {
  const l = await leerLimitesEnTx(tx, tenantId);
  return capFacturasMesEfectivo(columna, l?.limites.topes.facturasAutomaticasMes, TOPE_MAXIMO);
}
