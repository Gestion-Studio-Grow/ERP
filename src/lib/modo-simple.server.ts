// Estado del modo simple para ESTE pedido: lo guardado de la persona (fila `ui:modo-simple`, viaja en
// la sesión) y la cookie de sesión de «Ver todo». Servidor. Ver src/lib/modo-simple.ts.

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { COOKIE_VER_TODO, esModoSimple, prefiereModoSimple } from "@/lib/modo-simple";

export type EstadoModoSimple = {
  /** La persona lo tiene guardado (casilla de Usuarios o «Ver menos»). */
  prefiere: boolean;
  /** Esta pantalla se dibuja en simple (guardado y sin «Ver todo» en esta sesión). */
  activo: boolean;
};

export const modoSimpleDeLaSesion = cache(async (): Promise<EstadoModoSimple> => {
  const user = await getCurrentUser();
  const prefiere = prefiereModoSimple(user);
  if (!prefiere) return { prefiere: false, activo: false };
  const verTodo = (await cookies()).get(COOKIE_VER_TODO)?.value === "1";
  return { prefiere, activo: esModoSimple(user, { verTodo }) };
});
