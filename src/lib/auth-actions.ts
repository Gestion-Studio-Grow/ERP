"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieName } from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-password";
import { prisma } from "@/lib/prisma";
import { DireccionSinNegocioError, getCurrentTenantId } from "@/lib/tenant";
import { requestIp } from "@/lib/audit-core";
import { adminLoginGuard } from "@/lib/rate-limit";
import { abrirSesion, destinoTrasIngreso } from "@/lib/ingreso.server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  // Rate limiting anti fuerza bruta (Célula 2): 5 fallos / 15 min por IP + email, con techos
  // por email y por IP (rate-limit.ts, UAT 16/10 C9). Se chequea ANTES de tocar la DB — un
  // atacante bloqueado ni siquiera consulta.
  const ip = (await requestIp()) ?? "unknown";
  if (adminLoginGuard.blocked(ip, email)) {
    redirect(`/admin/login?error=throttled&next=${encodeURIComponent(next)}`);
  }

  // Una dirección sin negocio vuelve al ingreso, que explica qué pasa (no un error genérico).
  let tenantId: string;
  try {
    tenantId = await getCurrentTenantId();
  } catch (e) {
    if (e instanceof DireccionSinNegocioError) redirect("/admin/login");
    throw e;
  }
  const user = await prisma.user.findFirst({
    where: { tenantId, email, active: true, deletedAt: null },
  });

  // Un solo mensaje de error para email inexistente y contraseña incorrecta —
  // no revela si el email existe. verifyPassword se corre igual sobre el hash
  // real cuando el usuario existe.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    adminLoginGuard.fail(ip, email);
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  // Login válido: limpiar el contador para no penalizar al usuario legítimo.
  adminLoginGuard.succeed(ip, email);

  // Una productora: quien ve plata no entra sólo con la clave. Todavía no hay sesión: sale un pase que el portón no acepta.
  const { darPase, exigeSegundoPaso } = await import("@/lib/proyectos/segundo-factor.server");
  if (await exigeSegundoPaso(user)) {
    await darPase(user.id);
    redirect(`/admin/login/segundo-paso?next=${encodeURIComponent(next)}`);
  }
  // Comercial/Producción sin app de códigos: PIN por mail (Rendí §4). El código sale ya; la pantalla permite pedir otro.
  const { exigePin, pedirPin } = await import("@/lib/rendiciones/pin.server");
  if (await exigePin(user)) {
    await darPase(user.id);
    await pedirPin(tenantId, user);
    redirect(`/admin/login/pin?next=${encodeURIComponent(next)}`);
  }

  await abrirSesion(user.id);
  redirect(await destinoTrasIngreso(user, next));
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());
  redirect("/admin/login");
}
