// Guard de sesión del plano de operador (ADR-021), lado Node. Resuelve la cookie
// firmada del operador; NO lo importa el proxy (edge) — ese usa readOperatorToken.

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getOperatorCookieName, readOperatorToken } from "@/lib/operator-auth";

// ¿Hay una sesión de operador válida en la request? Cacheado por request.
export const getOperator = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  return readOperatorToken(cookieStore.get(getOperatorCookieName())?.value);
});

// Guard duro para páginas/acciones del plano de operador. Redirige al login si no hay
// sesión. Es la segunda red además del portón del proxy.
export async function requireOperator(): Promise<string> {
  const op = await getOperator();
  if (!op) redirect("/operador/login");
  return op;
}
