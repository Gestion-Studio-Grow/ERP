// Autorización fina del panel (ADR-017 §2.e) — RUNTIME NODE (usa `session.ts`,
// que usa Prisma + cookies). Se llama al tope de cada Server Action de mutación y
// de cada loader/página de `/admin`. El mapa rol→capacidades es DATO y vive en
// `capabilities.ts`; acá están solo los helpers que resuelven la sesión y
// aplican el chequeo.
//
// La autorización se hace en el server, no solo en el front (ADR-017 §2.e:
// "ocultar un botón no es seguridad"). El `proxy.ts` sigue haciendo el portón
// grueso ("¿hay sesión válida?"); esto es la puerta fina por acción.

import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/lib/session";
import { homeRoute, roleHasCapability, type Capability } from "@/lib/capabilities";

// Exige una sesión válida. Sin usuario → al login. Devuelve el usuario ya
// tipado (redirect() corta el flujo, así que el retorno nunca es null).
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/admin/login");
  }
  return user;
}

// Exige una capacidad concreta. Sin sesión → al login; con sesión pero sin la
// capacidad → a la home de su rol (que siempre puede ver, así no hay loop de
// redirects). Devuelve el usuario para que la acción/loader lo reuse (p.ej. el
// scoping de PROFESSIONAL a su `professionalId`).
export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!roleHasCapability(user.role, cap)) {
    redirect(homeRoute(user.role));
  }
  return user;
}
