// Reset del OWNER de un negocio SIN sesión de operador, para el responsable de seguridad (Factory-GSG
// `CLAUDE.md` § «Responsable de seguridad (08/11)»). Es la misma lógica oficial que la consola
// (`resetOwnerPasswordDeTenant`, operator-actions.ts): confirmación tipeando el slug, `enElNegocio`,
// `resetOwnerPasswordCore` con `operatorResetPort`. Lo único distinto es quién firma la auditoría.
//
// Además VERIFICA dentro de la misma transacción que el flag quedó en true y que la fila de auditoría
// existe; si algo no cierra, tira y la transacción se deshace: no se entrega una provisoria sin rastro
// o sin cambio obligatorio. La contraseña en claro sólo vive en el retorno.
//
// A QUIÉN se resetea: un negocio puede tener varios OWNER activos, y el puerto de la consola elige el
// más antiguo (que puede ser otra persona). Por eso acá se elige ANTES de escribir nada:
//   - con `email` (sin espacios ni mayúsculas): el único OWNER activo de ESTE negocio con ese email;
//     si no hay exactamente uno, error;
//   - sin `email` y más de un OWNER activo: error, hay que indicar el email;
//   - sin `email` y un solo OWNER activo: ése (comportamiento de siempre).
// El elegido se fija en el puerto (`ownerId`) y la verificación posterior se hace sobre ese id.
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
  { slug, confirmacion, actor, email }: { slug: string; confirmacion: string; actor: string; email?: string },
): Promise<ResetPorSlugResult> {
  if (!actor.trim()) return { ok: false, error: "Falta quién firma la auditoría." };
  if (!slug.trim() || confirmacion.trim().toLowerCase() !== slug.trim().toLowerCase()) {
    return { ok: false, error: "La confirmación no coincide con el slug del negocio." };
  }
  const tenant = await db.tenant.findUnique({ where: { slug: slug.trim().toLowerCase() }, select: { id: true } });
  if (!tenant) return { ok: false, error: "Ese negocio no existe." };
  const tenantId = tenant.id;
  const emailBuscado = (email ?? "").trim().toLowerCase();

  return enElNegocio(
    tenantId,
    async (tx): Promise<ResetPorSlugResult> => {
      // Comparación en JS (no `mode: "insensitive"`): evita que `_` o `%` del email actúen de comodín.
      const owners = await tx.user.findMany({
        where: { tenantId, role: "OWNER", active: true, deletedAt: null },
        select: { id: true, email: true },
      });
      let ownerId: string | undefined;
      if (emailBuscado) {
        const coinciden = owners.filter((o) => o.email.trim().toLowerCase() === emailBuscado);
        if (coinciden.length !== 1) {
          return { ok: false, error: "No hay un dueño activo de este negocio con ese email: no se tocó nada." };
        }
        ownerId = coinciden[0].id;
      } else {
        if (owners.length > 1) {
          return { ok: false, error: "Hay más de un dueño activo: indicá RESET_EMAIL. No se tocó nada." };
        }
        ownerId = owners[0]?.id;
      }
      if (!ownerId) return { ok: false, error: "Este negocio no tiene un dueño activo: no se tocó nada." };

      const r = await resetOwnerPasswordCore(operatorResetPort(tx, tenantId, { ownerId }), {
        tenantId,
        operatorSubject: actor,
      });
      if (!r.ok) return r;
      const audit = await tx.auditLog.findFirst({
        where: { tenantId, action: AUDIT_ACTION_OWNER_RESET, entity: "User", entityId: ownerId, actor: `operator:${actor}` },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!audit) throw new Error("El reset no dejó auditoría: no se entrega.");
      const owner = await tx.user.findFirst({
        where: { id: ownerId, tenantId },
        select: { mustChangePassword: true },
      });
      if (owner?.mustChangePassword !== true) throw new Error("El cambio obligatorio no quedó marcado: no se entrega.");
      return { ok: true, password: r.password, email: r.email, userId: ownerId, tenantId, auditId: audit.id };
    },
    db,
  );
}
