// Lo que pasa una vez comprobada la identidad, sea por clave, por clave y código, o por Google: un solo lugar emite la cookie
// de sesión y decide a dónde va la persona.

import "server-only";
import { cookies } from "next/headers";
import { createSessionToken, getSessionCookieName, VIDA_COOKIE_SESION_S } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProductoContexto } from "@/lib/producto";
import { productoHome, rutaPermitidaParaProducto } from "@/lib/producto-identidad";
import { mustChangePasswordFor } from "@/lib/must-change-password";
import { aterrizajeDelPanel } from "@/apps/visibles";
import { reiniciarFallosTrasIngreso, tienePin } from "@/lib/sesion-pin.server";
import { getCurrentTenantId } from "@/lib/tenant";

export async function abrirSesion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  // Entró con su contraseña (o Google, o clave y código): el PIN de desbloqueo vuelve a tener todos sus intentos.
  // Si la base falla acá, el ingreso sigue: lo peor es un PIN con menos intentos (pide la contraseña antes).
  await reiniciarFallosTrasIngreso(userId, await getCurrentTenantId()).catch((e) => console.error("[sesion-pin] no se reiniciaron los fallos", e));
  await ponerCookieDeSesion(await createSessionToken(userId));
}

/** Escribe la cookie de sesión con un token ya emitido (lo usa también el canje del token viejo, sin tocar lastLoginAt). */
export async function ponerCookieDeSesion(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // La sesión vive mientras se use (auth.ts): la cookie dura lo mismo que una sesión bloqueada, 7 días sin uso.
    maxAge: VIDA_COOKIE_SESION_S,
  });
}

export type OpcionesDelDestino = {
  /**
   * Ofrecer definir el PIN de desbloqueo si todavía no tiene (sesion-pin.ts). Sólo tras comprobar la contraseña (o
   * Google, o clave y código); el canje del token viejo pasa `false`.
   */
  ofrecerPin?: boolean;
};

export async function destinoTrasIngreso(
  user: { id: string; tenantId: string; role: string },
  next: string,
  opciones: OpcionesDelDestino = {},
): Promise<string> {
  const destino = await destinoDelProducto(user, next);
  // PIN DE DESBLOQUEO: lo define cada usuario después del primer ingreso (o del cambio obligatorio de contraseña, que
  // va primero). Se puede saltear: sin PIN, la sesión bloqueada pide la contraseña.
  if (destino !== "/admin/cambiar-password" && opciones.ofrecerPin !== false && !(await tienePin(user.id, user.tenantId).catch(() => true))) {
    return `/admin/definir-pin?next=${encodeURIComponent(destino)}`;
  }
  return destino;
}

async function destinoDelProducto(user: { id: string; tenantId: string; role: string }, next: string): Promise<string> {
  // CONTRASEÑA TEMPORAL: si el OWNER entra con una contraseña marcada para cambio forzado
  // (reset del operador), lo mandamos derecho a definir una nueva ANTES de cualquier ruteo por
  // producto. Sin la columna devuelve false (sin ella no se emiten provisorias); ante otro error,
  // true: falla cerrado y lo manda a cambiarla.
  if (await mustChangePasswordFor({ id: user.id, tenantId: user.tenantId })) {
    return "/admin/cambiar-password";
  }

  // RUTEO POST-LOGIN POR PRODUCTO (frente identidad-por-producto): cada producto entra a
  // SU casa (Comerciante → /admin, Contador → /contador, Facturita → /facturita/app; el ERP
  // vertical → /admin, como siempre). Se honra un `next` explícito SOLO si cae en el área
  // del producto (no se manda un usuario de Facturita al /admin de otro producto).
  const { producto } = await getProductoContexto();
  const home = productoHome(producto);
  const dest = next !== "/admin" && rutaPermitidaParaProducto(producto, next) ? next : home;
  // Panel cerrado: directo a su pantalla. Pasar por /admin encadena dos redirecciones después de la acción
  // y el enrutador queda pidiendo la página en bucle, con la pantalla en blanco.
  if (dest === "/admin") {
    const { getNegocioApps } = await import("@/apps/contexto.server");
    return aterrizajeDelPanel(await getNegocioApps(user.role as never)) ?? dest;
  }
  return dest;
}
