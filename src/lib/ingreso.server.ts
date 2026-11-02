// Lo que pasa una vez comprobada la identidad, sea por clave, por clave y código, o por Google: un solo lugar emite la cookie
// de sesión y decide a dónde va la persona.

import "server-only";
import { cookies } from "next/headers";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProductoContexto } from "@/lib/producto";
import { productoHome, rutaPermitidaParaProducto } from "@/lib/producto-identidad";
import { mustChangePasswordFor } from "@/lib/must-change-password";
import { aterrizajeDelPanel } from "@/apps/visibles";

export async function abrirSesion(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), await createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function destinoTrasIngreso(user: { id: string; tenantId: string; role: string }, next: string): Promise<string> {
  // CONTRASEÑA TEMPORAL: si el OWNER entra con una contraseña marcada para cambio forzado
  // (reset del operador), lo mandamos derecho a definir una nueva ANTES de cualquier ruteo por
  // producto. Fail-safe: si la columna no existe todavía (Gate 2 sin aplicar), devuelve false y
  // el login sigue normal.
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
