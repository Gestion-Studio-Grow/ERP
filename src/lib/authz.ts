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
import { getCurrentUser, getSesionDelPanel, type SessionUser } from "@/lib/session";
import { homeRoute, motivoSoloLoSuyo, permisoEfectivo, permisoFueraDeLaAgenda, type Capability } from "@/lib/capabilities";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";

/** La pantalla del cambio obligatorio de contraseña: la única puerta abierta con la provisoria pendiente. */
export const RUTA_CAMBIAR_PASSWORD = "/admin/cambiar-password";

// Exige una sesión válida. Sin usuario → al login. Con el CAMBIO OBLIGATORIO de contraseña pendiente → a cambiarla
// (ENG-104, GSG-SEG-013): ninguna pantalla, Server Action ni ruta que pase por acá (requireCapability, requireApp…)
// corre con una contraseña provisoria. Devuelve el usuario ya tipado (redirect() corta el flujo).
export async function requireUser(): Promise<SessionUser> {
  const sesion = await getSesionDelPanel();
  if (!sesion) redirect("/admin/login");
  if (sesion.mustChangePassword) redirect(RUTA_CAMBIAR_PASSWORD);
  return sesion.user;
}

// SÓLO para la pantalla del cambio obligatorio y su acción (`change-password-actions.ts`): exige sesión pero deja
// pasar a quien tiene el cambio pendiente (es justamente lo que viene a hacer). Cualquier otro uso abre el portón.
export async function requireUserConCambioPendiente(): Promise<SessionUser> {
  const sesion = await getSesionDelPanel();
  if (!sesion) redirect("/admin/login");
  return sesion.user;
}

// Exige una capacidad concreta. Sin sesión → al login; con sesión pero sin la
// capacidad → a la home de su rol (que siempre puede ver, así no hay loop de
// redirects). Devuelve el usuario para que la acción/loader lo reuse (p.ej. el
// scoping de PROFESSIONAL a su `professionalId`).
export async function requireCapability(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  // Rol + matriz de permisos por usuario (PLAN permisos §2): un solo resolvedor.
  if (!permisoEfectivo(user, cap)) {
    redirect(homeRoute(user.role));
  }
  return user;
}

/**
 * `requireCapability` para los módulos que NO son la agenda de turnos (pádel, taller, inmobiliaria,
 * proyectos…): ahí la excepción de agendar/editar que la matriz le prende a un PROFESSIONAL no vale,
 * porque esos módulos no tienen el scoping «sólo lo suyo» (`permisoFueraDeLaAgenda`, certificación M3).
 */
export async function requireCapabilityFueraDeLaAgenda(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!permisoFueraDeLaAgenda(user, cap)) {
    redirect(homeRoute(user.role));
  }
  return user;
}

/**
 * ¿El usuario de este request tiene la capacidad? A diferencia de `requireCapability`,
 * NO redirige: devuelve un booleano. Es para decidir si MOSTRAR algo (una solapa, un
 * botón) en una pantalla a la que la persona sí puede entrar por otro motivo.
 *
 * Ocultar en el front es UX; la seguridad real sigue siendo el `requireCapability` de la
 * acción del servidor (ADR-017 §2.e). Sin sesión devuelve false, no redirige.
 */
export async function canCurrentUser(cap: Capability): Promise<boolean> {
  const user = await getCurrentUser();
  return user ? permisoEfectivo(user, cap) : false;
}

/**
 * Scoping «en su agenda» (PLAN permisos §5): un PROFESSIONAL toca sólo turnos de su
 * `professionalId` (sin ficha vinculada, ninguno). TIRA `RechazoDeDominio`, así la action lo
 * muestra con su motivo. Invariante dura: se llama también adentro de la transacción.
 */
export function soloLoSuyo(
  user: Pick<SessionUser, "role" | "professionalId">,
  professionalIdDelTurno: string | null | undefined,
): void {
  const motivo = motivoSoloLoSuyo(user, professionalIdDelTurno);
  if (motivo) throw new RechazoDeDominio(motivo);
}

/**
 * El mismo scoping como filtro de Prisma, para lecturas y `updateMany` por id: `{}` para quien no es
 * PROFESSIONAL; para un PROFESSIONAL, sus turnos (sin ficha vinculada, un id imposible → nada).
 */
export function filtroSoloLoSuyo(
  user: Pick<SessionUser, "role" | "professionalId">,
): { professionalId?: string } {
  if (user.role !== "PROFESSIONAL") return {};
  return { professionalId: user.professionalId ?? "__sin_ficha_vinculada__" };
}

/**
 * Exige AL MENOS UNA de las capacidades (p. ej. las fichas del alta sirven a quien agenda y a quien
 * edita). Misma salida que `requireCapability` si no tiene ninguna.
 */
export async function requireAlgunaCapability(caps: readonly Capability[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!caps.some((cap) => permisoEfectivo(user, cap))) {
    redirect(homeRoute(user.role));
  }
  return user;
}
