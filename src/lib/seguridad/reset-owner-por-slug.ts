// Reset del OWNER de un negocio SIN sesión de operador, para el responsable de seguridad (Factory-GSG
// `CLAUDE.md` § «Responsable de seguridad (08/11)»). Es la misma lógica oficial que la consola
// (`resetOwnerPasswordDeTenant`, operator-actions.ts): confirmación tipeando el slug, `enElNegocio`,
// `resetOwnerPasswordCore` con `operatorResetPort`. Lo único distinto es quién firma la auditoría.
//
// Además VERIFICA dentro de la misma transacción que el flag quedó en true y que la fila de auditoría
// existe; si algo no cierra, tira y la transacción se deshace: no se entrega una provisoria sin rastro
// o sin cambio obligatorio. La contraseña en claro sólo vive en el retorno.
import type { PrismaClient } from "@/generated/prisma/client";
import { enElNegocio } from "@/lib/operator-db";
import { AUDIT_ACTION_OWNER_RESET } from "@/lib/must-change-password";
import { resetOwnerPasswordCore } from "@/lib/owner-password-reset";
import { operatorResetPort } from "@/lib/operador/owner-reset-port";

export type ResetPorSlugResult =
  | { ok: true; password: string; email: string; userId: string; tenantId: string; auditId: string }
  | { ok: false; error: string };

export async function resetOwnerPorSlug(
  db: PrismaClient,
  { slug, confirmacion, actor }: { slug: string; confirmacion: string; actor: string },
): Promise<ResetPorSlugResult> {
  if (!actor.trim()) return { ok: false, error: "Falta quién firma la auditoría." };
  if (!slug.trim() || confirmacion.trim().toLowerCase() !== slug.trim().toLowerCase()) {
    return { ok: false, error: "La confirmación no coincide con el slug del negocio." };
  }
  const tenant = await db.tenant.findUnique({ where: { slug: slug.trim().toLowerCase() }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Ese negocio no existe." };
  const tenantId = tenant.id;

  return enElNegocio(
    tenantId,
    async (tx) => {
      const r = await resetOwnerPasswordCore(operatorResetPort(tx, tenantId), { tenantId, operatorSubject: actor });
      if (!r.ok) return r;
      const audit = await tx.auditLog.findFirst({
        where: { tenantId, action: AUDIT_ACTION_OWNER_RESET, entity: "User", actor: `operator:${actor}` },
        orderBy: { createdAt: "desc" },
        select: { id: true, entityId: true },
      });
      if (!audit?.entityId) throw new Error("El reset no dejó auditoría: no se entrega.");
      const owner = await tx.user.findFirst({
        where: { id: audit.entityId, tenantId },
        select: { mustChangePassword: true },
      });
      if (owner?.mustChangePassword !== true) throw new Error("El cambio obligatorio no quedó marcado: no se entrega.");
      return { ok: true, password: r.password, email: r.email, userId: audit.entityId, tenantId, auditId: audit.id };
    },
    db,
  );
}
