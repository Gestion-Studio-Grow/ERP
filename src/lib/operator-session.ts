// Guard de sesión del plano de operador (ADR-021), lado Node. Resuelve la cookie
// firmada del operador; NO lo importa el proxy (edge) — ese usa readOperatorToken.

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOperatorCookieName, readOperatorToken } from "@/lib/operator-auth";

/** Lo mínimo del almacén de cookies que hace falta (el de Next, o uno de prueba). */
export interface LectorDeCookies {
  get(nombre: string): { value: string } | undefined;
}

/**
 * El operador de estas cookies, o null. Mira SÓLO la cookie del operador: la `admin_session` de un
 * negocio no cuenta, y puesta en `operator_session` tampoco (readOperatorToken exige un payload de
 * operador firmado con el secreto del operador).
 */
export async function operadorDesdeCookies(store: LectorDeCookies): Promise<string | null> {
  return readOperatorToken(store.get(getOperatorCookieName())?.value);
}

// ¿Hay una sesión de operador válida en la request? Cacheado por request.
export const getOperator = cache(async (): Promise<string | null> => operadorDesdeCookies(await cookies()));

/**
 * Guard duro para páginas/acciones del plano de operador. Redirige al login si no hay
 * sesión. Es la segunda red además del portón del proxy. Devuelve el NOMBRE del operador:
 * el actor de la auditoría queda `operator:<nombre>`.
 */
export async function requireOperator(): Promise<string> {
  const op = await getOperator();
  if (!op) redirect("/operador/login");
  return op;
}
