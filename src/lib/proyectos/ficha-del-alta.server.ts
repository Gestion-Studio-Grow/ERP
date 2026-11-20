// MIA-229 · La ficha del equipo que nace con el alta de un usuario de una productora (`createUser`, user-actions.ts),
// en la MISMA transacción que el usuario (`crearUsuarioSiEntra`): no queda una cuenta sin puesto si algo falla.
import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ROLES_GESTION } from "./gestion-core";

/** Si ya hay una ficha activa sin cuenta con ese mail, se le vincula la cuenta y toma el puesto elegido; si no, se crea. */
export async function fichaDelAltaEnTx(tx: Prisma.TransactionClient, d: { tenantId: string; userId: string; nombre: string; email: string; rol: (typeof ROLES_GESTION)[number] }): Promise<void> {
  const libre = await tx.proyectoPersona.findFirst({
    where: { tenantId: d.tenantId, userId: null, activa: true, email: { equals: d.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (libre) {
    await tx.proyectoPersona.update({ where: { id: libre.id }, data: { userId: d.userId, rol: d.rol } });
    return;
  }
  await tx.proyectoPersona.create({ data: { tenantId: d.tenantId, userId: d.userId, nombre: d.nombre, email: d.email, rol: d.rol } });
}

/** El rol de la ficha activa de cada usuario del negocio (P4: la lista de usuarios se lee por el puesto). */
export async function puestosDeLosUsuarios(tenantId: string): Promise<Map<string, string>> {
  const fichas = await prisma.proyectoPersona.findMany({ where: { tenantId, activa: true, userId: { not: null } }, select: { userId: true, rol: true } });
  return new Map(fichas.map((f) => [f.userId as string, f.rol]));
}
