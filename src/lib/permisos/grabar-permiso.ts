// Escritura del cambio de una casilla (PLAN permisos §1/§8), adentro de una `tenantTransaction`.
// Separada de la action para probarla contra Postgres con RLS (`grabar-permiso-postgres.test.ts`).
// `tenantId` va escrito a mano además de RLS: el `deleteMany` nunca toca filas de otro negocio y el
// `upsert` crea la fila con el negocio de la sesión.

import type { tenantTransaction } from "@/lib/rls";
import type { PlanDelCambio } from "@/lib/permisos/cambio-de-permiso";

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

export async function grabarCambioDePermisoEnTx(
  tx: Tx,
  p: { tenantId: string; userId: string; plan: Pick<PlanDelCambio, "allowed" | "borrar" | "grabar"> },
): Promise<void> {
  const { tenantId, userId, plan } = p;
  if (plan.borrar.length > 0) {
    await tx.userPermissionOverride.deleteMany({
      where: { tenantId, userId, capability: { in: plan.borrar } },
    });
  }
  for (const capability of plan.grabar) {
    await tx.userPermissionOverride.upsert({
      where: { userId_capability: { userId, capability } },
      create: { tenantId, userId, capability, allowed: plan.allowed },
      update: { allowed: plan.allowed },
    });
  }
}
