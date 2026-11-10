// Puerto del reset del OWNER sobre una transacción parada en el negocio (`enElNegocio`). Sale de
// `operator-actions.ts` (que es "use server" y no puede exportar funciones comunes) para que lo usen
// igual la consola y el script del responsable de seguridad (`scripts/seguridad/reset-owner-password.mts`).
import type { Prisma } from "@/generated/prisma/client";
import { operatorSetMustChange } from "@/lib/must-change-password";
import type { OwnerResetPort } from "@/lib/owner-password-reset";

//
// `ownerId` (opcional) fija A QUÉ OWNER se resetea: el script de seguridad lo elige antes (por email o
// porque hay uno solo). Sin `ownerId` (la consola) sigue siendo el OWNER activo más antiguo. Aun con
// `ownerId`, el usuario tiene que ser OWNER activo de ESE negocio: si no, `findOwner` da null.
export function operatorResetPort(
  tx: Prisma.TransactionClient,
  tenantId: string,
  { ownerId }: { ownerId?: string } = {},
): OwnerResetPort {
  return {
    findOwner: (tid) =>
      tx.user.findFirst({
        where: { tenantId: tid, role: "OWNER", active: true, deletedAt: null, ...(ownerId ? { id: ownerId } : {}) },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      }),
    setPasswordHash: async (userId, passwordHash) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    },
    setMustChange: (userId, value) => operatorSetMustChange(tx, { userId, tenantId }, value),
    audit: async (entry) => {
      await tx.auditLog.create({
        data: { ...entry, changes: entry.changes as Prisma.InputJsonValue },
      });
    },
  };
}
