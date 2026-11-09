// Canje del token de sesión viejo (sin vencimiento) por uno nuevo (v3), SÓLO para la excepción del dueño (08/11/2026):
// ver src/lib/sesion-legado.ts. El proxy manda acá a quien llega con un token viejo de firma válida. Si la
// excepción lo cubre (usuario de la base, negocio beauty-spa, email en la lista, una sola vez, antes de la fecha
// tope), se le cambia la cookie en silencio y vuelve a donde iba; si no, se borra la cookie vieja y va al login
// con «tu sesión venció». Con una sesión nueva activa no toca nada (un GET cruzado no borra la sesión de nadie).
// Vive bajo /admin/login/ (el proxy lo deja pasar sin sesión) y corre en Node (Prisma).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getSessionCookieName } from "@/lib/auth";
import { destinoTrasIngreso, ponerCookieDeSesion } from "@/lib/ingreso.server";
import { prisma } from "@/lib/prisma";
import { planDeRenovacion } from "@/lib/sesion-legado";
import { getCurrentTenantId, slugResueltoDelPedido } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;

  const plan = await planDeRenovacion(token, request.nextUrl.searchParams.get("next"), async () => ({
    slugDelPedido: await slugResueltoDelPedido(),
    tenantIdDelPedido: await getCurrentTenantId(),
    cargarUsuario: (id, tenantId) =>
      prisma.user.findFirst({
        where: { id, tenantId, active: true, deletedAt: null },
        select: { id: true, email: true, tenantId: true, lastLoginAt: true },
      }),
    // UPDATE condicional atómico: con dos canjes simultáneos, el segundo re-evalúa el WHERE tras el primero y no
    // actualiza nada (count 0). Así el token viejo se canjea UNA sola vez.
    reclamarCanje: async (id, tenantId, ahora, corte) => {
      const r = await prisma.user.updateMany({
        where: {
          id,
          tenantId,
          active: true,
          deletedAt: null,
          OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: new Date(corte) } }],
        },
        data: { lastLoginAt: new Date(ahora) },
      });
      return r.count === 1;
    },
  }));

  if (plan.tipo === "seguir") redirect(plan.next);

  if (plan.tipo === "vencida") {
    if (plan.borrarCookie) cookieStore.delete(getSessionCookieName());
    redirect(`/admin/login?error=vencida&next=${encodeURIComponent(plan.next)}`);
  }

  await ponerCookieDeSesion(plan.tokenNuevo);
  const user = await prisma.user.findFirst({
    where: { id: plan.userId, tenantId: await getCurrentTenantId() },
    select: { id: true, tenantId: true, role: true },
  });
  // Canje sin contraseña: no se ofrece definir el PIN (eso pide un ingreso con contraseña reciente).
  redirect(user ? await destinoTrasIngreso(user, plan.next, { ofrecerPin: false }) : plan.next);
}
