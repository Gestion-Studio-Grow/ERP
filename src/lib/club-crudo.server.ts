// La consulta del club crudo (ver src/lib/club-crudo.ts). RUNTIME NODE: Prisma.
import { basePrisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { permisoEfectivo, type UsuarioConPermisos } from "@/lib/capabilities";
import { leerOverridesTolerante } from "@/lib/permisos-overrides";
import { SLUG_DEL_CLUB_CRUDO } from "@/lib/club-crudo";

export type LecturasDelClubCrudo = {
  /** Id del negocio por slug (cliente base: resolver un negocio cruza negocios, como tenant.ts). */
  negocioPorSlug: (slug: string) => Promise<string | null>;
  /** El usuario activo y no borrado de ESE negocio, con sus excepciones de permisos; `null` si no es de ahí. */
  usuarioDelNegocio: (userId: string, tenantId: string) => Promise<UsuarioConPermisos | null>;
};

const LECTURAS_REALES: LecturasDelClubCrudo = {
  negocioPorSlug: async (slug) =>
    (await basePrisma.tenant.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null,
  usuarioDelNegocio: (userId, tenantId) =>
    tenantTransaction(
      async (tx) => {
        const user = await tx.user.findFirst({
          where: { id: userId, tenantId, active: true, deletedAt: null },
          select: { role: true },
        });
        if (!user) return null;
        const overrides = await leerOverridesTolerante(() =>
          tx.userPermissionOverride.findMany({ where: { userId, tenantId }, select: { capability: true, allowed: true } }),
        );
        return { role: user.role, overrides };
      },
      { tenantId },
    ),
};

/**
 * ¿El `userId` de una sesión vigente es un usuario activo, no borrado, DEL NEGOCIO breakpoint y con
 * `agenda:manage` (rol + matriz de permisos)? El negocio sale del slug fijo, no del host: el club crudo se pide
 * desde cualquier host. Resolver el negocio por slug cruza negocios (como tenant.ts) y por eso usa el cliente base;
 * el usuario se lee dentro de `tenantTransaction` con ese negocio. `lecturas` se inyecta en los tests.
 */
export async function esUsuarioDelClubCrudo(
  userId: string | null,
  lecturas: LecturasDelClubCrudo = LECTURAS_REALES,
): Promise<boolean> {
  if (!userId) return false;
  const tenantId = await lecturas.negocioPorSlug(SLUG_DEL_CLUB_CRUDO);
  if (!tenantId) return false;
  const user = await lecturas.usuarioDelNegocio(userId, tenantId);
  return !!user && permisoEfectivo(user, "agenda:manage");
}
