// Sesión del panel a nivel usuario (ADR-017 §2.c). Resuelve la cookie firmada al
// `User` real de la base, chequeando que siga activo y exista.
//
// RUNTIME NODE (usa Prisma + cookies): NO lo importa `src/proxy.ts` (edge) — el
// proxy hace solo el portón grueso con `readSessionToken` de auth.ts. La
// autorización fina (requireCapability) vive en `authz.ts` (ADR-017 Fase 2) y se
// apoya en este `getCurrentUser`. También da el `actor` real al audit trail.

import { cache } from "react";
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

// Envuelto en `cache()` de React: se dedupe por request, así los múltiples
// llamadores dentro del mismo render (guard de página + guard del loader +
// auditAdmin) comparten un solo lookup a la base en vez de repetirlo.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
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
});
