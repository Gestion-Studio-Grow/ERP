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
import { isDemoSandbox, DEMO_SESSION_USER } from "@/lib/demo-sandbox";
import type { PermisoOverride } from "@/lib/capabilities";
import { leerOverridesTolerante } from "@/lib/permisos-overrides";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "RECEPTION" | "PROFESSIONAL";
  professionalId: string | null;
  tenantId: string;
  // Excepciones de la matriz de permisos (PLAN permisos §1). `[]` = rige el rol. Se resuelven con
  // `permisoEfectivo(user, cap)`, nunca con roleHasCapability sobre el rol solo.
  overrides: ReadonlyArray<PermisoOverride>;
};

// La sesión del pedido tal cual: el usuario y si tiene el CAMBIO OBLIGATORIO de contraseña pendiente. Sólo la usan
// el portón (`authz.ts`: requireUser / requireUserConCambioPendiente) y la auditoría (el actor es quien es, aunque
// tenga el cambio pendiente). Todo lo demás pasa por `getCurrentUser()`.
//
// Envuelto en `cache()` de React: se dedupe por request, así los múltiples
// llamadores dentro del mismo render (guard de página + guard del loader +
// auditAdmin) comparten un solo lookup a la base en vez de repetirlo.
export type SesionDelPanel = { user: SessionUser; mustChangePassword: boolean };

export const getSesionDelPanel = cache(async (): Promise<SesionDelPanel | null> => {
  // Modo SANDBOX de preventa (docs/preventa/plan-acceso-sandbox-sin-password.md):
  // identidad ficticia fija, SIN leer cookie ni tocar Prisma/User en absoluto.
  if (isDemoSandbox()) return { user: DEMO_SESSION_USER, mustChangePassword: false };

  const cookieStore = await cookies();
  const userId = await readSessionToken(cookieStore.get(getSessionCookieName())?.value);
  if (!userId) return null;

  // Lookup tenant-scoped (ADR-017 depende de ADR-015): el usuario tiene que
  // pertenecer al tenant resuelto, estar activo y no borrado.
  // `mustChangePassword` sale en la MISMA consulta (cero viajes extra): la columna está en schema.prisma y el login ya
  // la lee (su `findFirst` sin `select` trae todas las columnas), así que no agrega una dependencia nueva de la base.
  const tenantId = await getCurrentTenantId();
  const fila = await prisma.user.findFirst({
    where: { id: userId, tenantId, active: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      professionalId: true,
      tenantId: true,
      mustChangePassword: true,
    },
  });
  if (!fila) return null;
  const { mustChangePassword, ...user } = fila;

  // Consulta aparte (no un `select` anidado) para que la tabla ausente (Gate 2) no tumbe el login:
  // sólo P2021/P2022 → `[]`; otro error se relanza. El cambio rige en el próximo request.
  const overrides = await leerOverridesTolerante(() =>
    prisma.userPermissionOverride.findMany({
      where: { userId: user.id, tenantId },
      select: { capability: true, allowed: true },
    }),
  );
  return { user: { ...user, overrides }, mustChangePassword: mustChangePassword === true };
});

// PORTÓN DEL CAMBIO OBLIGATORIO (ENG-104, GSG-SEG-013): con la contraseña provisoria pendiente de cambio, para el
// resto de la app NO HAY SESIÓN. Toda pantalla, Server Action o ruta que pregunta por el usuario recibe null, así
// que el portón no depende de que cada una se acuerde de chequear el flag. Las únicas que pasan con el cambio
// pendiente usan `requireUserConCambioPendiente()` (la pantalla de cambio y su acción); salir no pide sesión.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const sesion = await getSesionDelPanel();
  return sesion && !sesion.mustChangePassword ? sesion.user : null;
});
