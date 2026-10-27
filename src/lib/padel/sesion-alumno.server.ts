import "server-only";

// La cookie del alumno: leerla, escribirla y borrarla. Las reglas (qué atributos, a quién se le
// entrega el token) son puras y viven en sesion-alumno.ts. Escribir una cookie sólo se puede en
// una Server Action o en un Route Handler; leerla, también desde un Server Component.

import { cookies, headers } from "next/headers";
import { tokenValido } from "./core";
import { COOKIE_ALUMNO, opcionesCookie } from "./sesion-alumno";

export const COOKIE = COOKIE_ALUMNO;

/** El token que guardó este navegador, o null si no hay o no tiene forma de token. */
export async function leerTokenCookie(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE_ALUMNO)?.value ?? null;
  return tokenValido(v) ? v : null;
}

export async function escribirTokenCookie(token: string): Promise<void> {
  if (!tokenValido(token)) return;
  const h = await headers();
  (await cookies()).set(COOKIE_ALUMNO, token, opcionesCookie(h.get("x-forwarded-host") ?? h.get("host")));
}

export async function borrarTokenCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_ALUMNO);
}
