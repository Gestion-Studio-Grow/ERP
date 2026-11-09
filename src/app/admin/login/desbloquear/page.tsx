// Sesión BLOQUEADA por inactividad (15 min sin uso, auth.ts): se destraba con el PIN del usuario, sin la contraseña.
// El proxy manda acá; la página vive bajo /admin/login/ (pasa sin sesión activa) y decide con la cookie y la base:
// sin sesión bloqueada, sin PIN o sin intentos → a la contraseña. Reglas: src/lib/sesion-pin.ts.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionCookieName, INACTIVIDAD_BLOQUEO_MS, leerSesion } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_INTENTOS_PIN } from "@/lib/sesion-pin";
import { cargarPin } from "@/lib/sesion-pin.server";
import { destinoDeRenovar } from "@/lib/sesion-legado";
import { getCurrentTenantId } from "@/lib/tenant";
import HojaSimple from "../HojaSimple";
import { FormularioDesbloqueo } from "./_formulario";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seguí con tu PIN", robots: { index: false, follow: false }, generator: "Gestión Studio Grow" };

export default async function Desbloquear({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = destinoDeRenovar((await searchParams).next);
  const alLogin = (error?: string) =>
    redirect(`/admin/login?${error ? `error=${error}&` : ""}next=${encodeURIComponent(next)}`);

  const token = (await cookies()).get(getSessionCookieName())?.value;
  const sesion = await leerSesion(token);
  if (!sesion) alLogin(token ? "vencida" : undefined);
  if (sesion!.estado === "activa") redirect(next);
  if (sesion!.estado === "vencida") alLogin("vencida");

  const tenantId = await getCurrentTenantId();
  const user = await prisma.user.findFirst({
    where: { id: sesion!.userId, tenantId, active: true, deletedAt: null },
    select: { name: true },
  });
  if (!user) alLogin("vencida");
  const pin = await cargarPin(sesion!.userId, tenantId).catch(() => null);
  if (!pin) alLogin("inactiva");
  if (!(pin!.fallos < MAX_INTENTOS_PIN)) alLogin("pin");

  return (
    <HojaSimple titulo={`Hola, ${user!.name.split(/\s+/)[0]}`}>
      <p className="text-sm text-muted">
        Pasaron {Math.round(INACTIVIDAD_BLOQUEO_MS / 60_000)} minutos sin uso y tapamos la pantalla. Escribí tu PIN para seguir donde estabas.
      </p>
      <FormularioDesbloqueo next={next} />
    </HojaSimple>
  );
}
