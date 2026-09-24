// Guard de sesión del plano de operador (ADR-021), lado Node. Resuelve la cookie
// firmada del operador; NO lo importa el proxy (edge) — ese usa readOperatorToken.

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOperatorCookieName, leerSesionOperador, type SesionOperador } from "@/lib/operator-auth";

/** Lo mínimo del almacén de cookies que hace falta (el de Next, o uno de prueba). */
export interface LectorDeCookies {
  get(nombre: string): { value: string } | undefined;
}

/**
 * La sesión de operador de estas cookies, o null. Mira SÓLO la cookie del operador: la
 * `admin_session` de un negocio no cuenta, y puesta en `operator_session` tampoco
 * (leerSesionOperador exige un payload de operador firmado con el secreto del operador).
 */
export async function sesionDesdeCookies(store: LectorDeCookies): Promise<SesionOperador | null> {
  return leerSesionOperador(store.get(getOperatorCookieName())?.value);
}

/** El NOMBRE del operador de estas cookies, o null. */
export async function operadorDesdeCookies(store: LectorDeCookies): Promise<string | null> {
  return (await sesionDesdeCookies(store))?.nombre ?? null;
}

// ¿Hay una sesión de operador válida en la request? Cacheado por request.
export const getSesionOperador = cache(async (): Promise<SesionOperador | null> => sesionDesdeCookies(await cookies()));

export const getOperator = cache(async (): Promise<string | null> => (await getSesionOperador())?.nombre ?? null);

/** Como `requireOperator`, pero devuelve la sesión entera (nombre, rol y si es el dueño). */
export async function requireSesionOperador(): Promise<SesionOperador> {
  const s = await getSesionOperador();
  if (!s) redirect("/operador/login");
  return s;
}

/**
 * Guard duro para páginas/acciones del plano de operador que NO tocan un negocio en particular (el
 * layout, la lista, el logout). Redirige al login si no hay sesión. Devuelve el NOMBRE del operador:
 * el actor de la auditoría queda `operator:<nombre>`.
 *
 * Toda action que recibe o afecta un negocio usa `requireOperadorParaNegocio`
 * (src/lib/operador/guardia-negocio.ts), que además aplica el candado de CH: lo exige el trinquete
 * de guardia-negocio.test.ts.
 */
export async function requireOperator(): Promise<string> {
  return (await requireSesionOperador()).nombre;
}
