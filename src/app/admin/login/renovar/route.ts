// Canje del token de sesión viejo (sin vencimiento) por uno v2, SÓLO para la excepción del dueño (08/11/2026):
// ver src/lib/sesion-legado.ts. El proxy manda acá a quien llega con un token viejo de firma válida. Si la
// excepción lo cubre (usuario de la base, negocio beauty-spa, email en la lista), se le cambia la cookie en
// silencio y vuelve a donde iba; si no, se borra la cookie y va al login con «tu sesión venció».
// Vive bajo /admin/login/ (el proxy lo deja pasar sin sesión) y corre en Node (Prisma).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getSessionCookieName } from "@/lib/auth";
import { destinoTrasIngreso, ponerCookieDeSesion } from "@/lib/ingreso.server";
import { prisma } from "@/lib/prisma";
import { canjearTokenLegado } from "@/lib/sesion-legado";
import { getCurrentTenantId, slugResueltoDelPedido } from "@/lib/tenant";

/** `next` interno o `/admin`: nunca otra dirección (`//x`, `/\x`, absoluta). */
function siguienteInterno(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/admin";
}

export async function GET(request: NextRequest) {
  const next = siguienteInterno(request.nextUrl.searchParams.get("next"));
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;

  let canje: Awaited<ReturnType<typeof canjearTokenLegado>> = null;
  try {
    canje = await canjearTokenLegado(token, {
      slugDelPedido: await slugResueltoDelPedido(),
      tenantIdDelPedido: await getCurrentTenantId(),
      cargarUsuario: (id, tenantId) =>
        prisma.user.findFirst({
          where: { id, tenantId, active: true, deletedAt: null },
          select: { id: true, email: true, tenantId: true },
        }),
    });
  } catch {
    canje = null; // dirección sin negocio o la base caída: falla cerrada
  }

  if (!canje) {
    if (token) cookieStore.delete(getSessionCookieName());
    redirect(`/admin/login?error=vencida&next=${encodeURIComponent(next)}`);
  }

  await ponerCookieDeSesion(canje.tokenNuevo);
  const user = await prisma.user.findFirst({
    where: { id: canje.userId, tenantId: await getCurrentTenantId() },
    select: { id: true, tenantId: true, role: true },
  });
  redirect(user ? await destinoTrasIngreso(user, next) : next);
}
