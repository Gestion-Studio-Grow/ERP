// FACTOQUE · la barrera del producto para lo que no es server action (rutas de la conexión con
// Mercado Pago). Misma regla que `requireTenantFacturita` de facturita-actions.ts (que no se
// exporta a propósito: en un archivo "use server" cada export es un endpoint): sesión con
// `billing:manage` y el negocio del host tiene que ser de Facturita.

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";

export async function sesionFacturita(): Promise<{ tenantId: string; userId: string }> {
  const user = await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  // La sesión es de ESTE negocio (la cookie se firma por negocio, pero se afirma igual).
  if (user.tenantId !== tenantId) throw new Error("La sesión no es de este negocio.");
  const tenant = await tenantTransaction(
    (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } }),
    { tenantId },
  );
  if (tenant?.blueprintId !== "facturita") throw new Error("Esta pantalla es del producto Facturita.");
  return { tenantId, userId: user.id };
}
