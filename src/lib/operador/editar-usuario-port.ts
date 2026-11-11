// Puerto de la edición de una persona (editar-usuario.ts) sobre una transacción parada en el negocio
// (`enElNegocio`). Vive fuera de `operator-actions.ts` ("use server": no puede exportar funciones comunes),
// igual que `owner-reset-port.ts`. Todas las lecturas van con `select` explícito: `mustChangePassword` se
// lee con SQL crudo (must-change-password.ts) y un `find*` sin `select` pediría todas las columnas.
import type { Prisma } from "@/generated/prisma/client";
import { bloquearUsuariosDelNegocioEnTx, decidirAltaDeUsuarioEnTx } from "@/lib/usuarios-del-plan";
import type { EditarUsuarioPort } from "@/lib/operador/editar-usuario";

export function editarUsuarioPort(tx: Prisma.TransactionClient): EditarUsuarioPort {
  return {
    // EL candado de usuarios del negocio (usuarios-del-plan.ts): el mismo del alta, del tope y de la baja del
    // panel. Es reentrante en la misma sesión, así que reactivar (que lo vuelve a tomar) no se traba.
    bloquearUsuarios: (tenantId) => bloquearUsuariosDelNegocioEnTx(tx, tenantId),
    leerUsuario: (tenantId, userId) =>
      tx.user.findFirst({
        where: { id: userId, tenantId },
        select: { id: true, name: true, role: true, active: true, professionalId: true, deletedAt: true },
      }),
    contarOwnersActivos: (tenantId) => tx.user.count({ where: { tenantId, role: "OWNER", active: true, deletedAt: null } }),
    fichas: async (tenantId) =>
      (
        await tx.professional.findMany({
          where: { tenantId, deletedAt: null },
          select: { id: true, user: { select: { id: true } } },
        })
      ).map((f) => ({ id: f.id, usuarioId: f.user?.id ?? null })),
    decidirTope: (tenantId) =>
      decidirAltaDeUsuarioEnTx(tx as unknown as Parameters<typeof decidirAltaDeUsuarioEnTx>[0], tenantId),
    // `updateMany` con `tenantId` en el filtro: aunque RLS ya lo limita, el id solo nunca alcanza.
    actualizar: async (tenantId, userId, data) => {
      await tx.user.updateMany({ where: { id: userId, tenantId, deletedAt: null }, data });
    },
    audit: async (entry) => {
      await tx.auditLog.create({ data: { ...entry, changes: entry.changes as Prisma.InputJsonValue } });
    },
  };
}
