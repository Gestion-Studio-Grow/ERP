// Puerto del reset del OWNER sobre una transacción parada en el negocio (`enElNegocio`). Sale de
// `operator-actions.ts` (que es "use server" y no puede exportar funciones comunes) para que lo usen
// igual la consola y el script del responsable de seguridad (`scripts/seguridad/reset-owner-password.mts`).
import type { Prisma } from "@/generated/prisma/client";
import { operatorSetMustChange } from "@/lib/must-change-password";
import type { OwnerResetPort } from "@/lib/owner-password-reset";
import type { OwnerActivo } from "@/lib/operador/elegir-owner";

//
// `ownerId` fija A QUÉ OWNER se resetea: la consola y el script de seguridad lo eligen antes con
// `elegirOwner` (elegir-owner.ts) sobre `ownersActivos`. Sin `ownerId` sería el OWNER activo más
// antiguo, que con varios puede ser otra persona: por eso los llamadores siempre lo pasan. Aun con
// `ownerId`, el usuario tiene que ser OWNER activo de ESE negocio: si no, `findOwner` da null.
/** Los OWNER activos del negocio (el más antiguo primero), leídos parado en él (`enElNegocio`). */
export function ownersActivos(tx: Prisma.TransactionClient, tenantId: string): Promise<OwnerActivo[]> {
  return tx.user.findMany({
    where: { tenantId, role: "OWNER", active: true, deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, email: true },
  });
}

//
// `enviarClave` es por dónde sale la provisoria (GSG-SEG-014): la consola y el reseteo pendiente la
// mandan por mail al titular (`clave-temporal-entrega.server.ts`); el script del responsable de
// seguridad la deja en su archivo 0600 (`reset-owner-por-slug.ts`).
export function operatorResetPort(
  tx: Prisma.TransactionClient,
  tenantId: string,
  { ownerId, enviarClave }: { ownerId?: string; enviarClave: OwnerResetPort["enviarClave"] },
): OwnerResetPort {
  return {
    findOwner: (tid) =>
      tx.user.findFirst({
        where: { tenantId: tid, role: "OWNER", active: true, deletedAt: null, ...(ownerId ? { id: ownerId } : {}) },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, name: true },
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
    enviarClave,
  };
}
