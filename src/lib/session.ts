// Sesión del panel a nivel usuario (ADR-017 §2.c). Resuelve la cookie firmada al
// `User` real de la base, chequeando que siga activo y exista.
//
// RUNTIME NODE (usa Prisma + cookies): NO lo importa `src/proxy.ts` (edge) — el
// proxy hace solo el portón grueso con `readSessionToken` de auth.ts. La
// autorización fina (requireRole) llega en la Fase 2 de ADR-017; por ahora esto
// existe para dar el `actor` real al audit trail y el login por usuario.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionCookieName, readSessionToken } from "@/lib/auth";
import { getCurrentTenantId } from "@/lib/tenant";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "RECEPTION" | "PROFESSIONAL";
  professionalId: string | null;
  tenantId: string;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const userId = await readSessionToken(cookieStore.get(getSessionCookieName())?.value);
  if (!userId) return null;

  // Lookup tenant-scoped (ADR-017 depende de ADR-015): el usuario tiene que
  // pertenecer al tenant resuelto, estar activo y no borrado.
  const tenantId = await getCurrentTenantId();
  return prisma.user.findFirst({
    where: { id: userId, tenantId, active: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      professionalId: true,
      tenantId: true,
    },
  });
}
