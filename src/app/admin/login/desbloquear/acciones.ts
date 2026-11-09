"use server";

// Destrabar la sesión bloqueada por inactividad con el PIN (reglas en src/lib/sesion-pin.ts).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieName } from "@/lib/auth";
import { ponerCookieDeSesion } from "@/lib/ingreso.server";
import { desbloquearConPin } from "@/lib/sesion-pin";
import { dependenciasDelPin } from "@/lib/sesion-pin.server";
import { destinoDeRenovar } from "@/lib/sesion-legado";
import { getCurrentTenantId } from "@/lib/tenant";
import { errorDelLoginPara } from "./destino";

export interface EstadoDelDesbloqueo {
  error?: string;
}

export async function desbloquear(_previo: EstadoDelDesbloqueo, formData: FormData): Promise<EstadoDelDesbloqueo> {
  const next = destinoDeRenovar(String(formData.get("next") ?? "/admin"));
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const r = await desbloquearConPin(token, formData.get("pin"), dependenciasDelPin(await getCurrentTenantId()));

  if (r.tipo === "errado") {
    return { error: `El PIN no es correcto. Te ${r.quedan === 1 ? "queda 1 intento" : `quedan ${r.quedan} intentos`}; después vas a tener que entrar con tu contraseña.` };
  }
  if (r.tipo === "desbloqueada") await ponerCookieDeSesion(r.tokenNuevo);
  if (r.tipo === "desbloqueada" || r.tipo === "activa") redirect(next);

  if (r.borrarCookie) cookieStore.delete(getSessionCookieName());
  redirect(`/admin/login?error=${errorDelLoginPara(r.motivo)}&next=${encodeURIComponent(next)}`);
}
