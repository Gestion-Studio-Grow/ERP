"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-password";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requestIp } from "@/lib/audit";
import { loginRateLimiter, loginKey } from "@/lib/rate-limit";
import { getProductoContexto } from "@/lib/producto";
import { productoHome, rutaPermitidaParaProducto } from "@/lib/producto-identidad";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  // Rate limiting anti fuerza bruta (Célula 2): 5 fallos / 15 min por IP. Se
  // chequea ANTES de tocar la DB — un atacante bloqueado ni siquiera consulta.
  const key = loginKey("admin", (await requestIp()) ?? "unknown");
  if (loginRateLimiter.blocked(key)) {
    redirect(`/admin/login?error=throttled&next=${encodeURIComponent(next)}`);
  }

  const tenantId = await getCurrentTenantId();
  const user = await prisma.user.findFirst({
    where: { tenantId, email, active: true, deletedAt: null },
  });

  // Un solo mensaje de error para email inexistente y contraseña incorrecta —
  // no revela si el email existe. verifyPassword se corre igual sobre el hash
  // real cuando el usuario existe.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    loginRateLimiter.fail(key);
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  // Login válido: limpiar el contador para no penalizar al usuario legítimo.
  loginRateLimiter.reset(key);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), await createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  // RUTEO POST-LOGIN POR PRODUCTO (frente identidad-por-producto): cada producto entra a
  // SU casa (Comerciante → /admin, Contador → /contador, Facturita → /facturita/app; el ERP
  // vertical → /admin, como siempre). Se honra un `next` explícito SOLO si cae en el área
  // del producto (no se manda un usuario de Facturita al /admin de otro producto).
  const { producto } = await getProductoContexto();
  const home = productoHome(producto);
  const dest = next !== "/admin" && rutaPermitidaParaProducto(producto, next) ? next : home;
  redirect(dest);
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());
  redirect("/admin/login");
}
