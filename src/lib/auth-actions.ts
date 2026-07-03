"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, getSessionCookieName } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-password";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  const tenantId = await getCurrentTenantId();
  const user = await prisma.user.findFirst({
    where: { tenantId, email, active: true, deletedAt: null },
  });

  // Un solo mensaje de error para email inexistente y contraseña incorrecta —
  // no revela si el email existe. verifyPassword se corre igual sobre el hash
  // real cuando el usuario existe.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

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

  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());
  redirect("/admin/login");
}
