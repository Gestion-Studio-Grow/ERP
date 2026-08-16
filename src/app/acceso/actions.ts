"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  GATE_MAX_AGE_DAYS,
  GATE_PATH,
  createGateToken,
  gatePassword,
  gatePasswordMatches,
  getGateCookieName,
} from "@/lib/site-gate";

// Validación de la clave del portón del sitio (ver `@/lib/site-gate`).
//
// No hay usuarios ni base de datos acá: es una clave compartida contra
// `SITE_GATE_PASSWORD`. Si acierta, se deja una cookie firmada y el visitante no
// vuelve a ver la puerta por 30 días. La cookie es httpOnly (el JavaScript de la
// página no puede leerla) y sameSite lax, para que el link de un QR o de WhatsApp
// la conserve al entrar.
//
// SIN JAVASCRIPT: el resultado se comunica REDIRIGIENDO (a destino si acierta, a
// la puerta con `?error=1` si no), en vez de devolverle un objeto al cliente. Así
// el formulario es un <form> común que funciona aunque el JS no haya cargado —
// que es justo lo que le pasaba a esta pantalla, y en una puerta de entrada no
// poder entrar por un chunk que no bajó es el peor de los mundos.
export async function entrarAlSitio(formData: FormData) {
  const clave = gatePassword();
  // Portón apagado: no hay nada que validar, se entra derecho.
  if (!clave) redirect("/");

  const intento = String(formData.get("clave") ?? "");
  const destinoCrudo = String(formData.get("next") ?? "/");
  // Sólo se acepta una ruta interna como destino: un `next` con http(s) o con //
  // convertiría esta pantalla en un trampolín para mandar gente a otro sitio.
  const destino =
    destinoCrudo.startsWith("/") && !destinoCrudo.startsWith("//") ? destinoCrudo : "/";

  if (!gatePasswordMatches(intento, clave)) {
    const url = new URL(GATE_PATH, "http://local");
    url.searchParams.set("error", "1");
    if (destino !== "/") url.searchParams.set("next", destino);
    redirect(url.pathname + url.search);
  }

  const jar = await cookies();
  jar.set(getGateCookieName(), await createGateToken(clave), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GATE_MAX_AGE_DAYS * 24 * 60 * 60,
  });

  redirect(destino);
}
