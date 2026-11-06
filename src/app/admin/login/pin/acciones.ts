"use server";

import { redirect } from "next/navigation";
import { abrirSesion, destinoTrasIngreso } from "@/lib/ingreso.server";
import { prisma } from "@/lib/prisma";
import { leerPaseActual, quitarPase } from "@/lib/proyectos/segundo-factor.server";
import { confirmarPin, pedirPin } from "@/lib/rendiciones/pin.server";
import { getCurrentTenantId } from "@/lib/tenant";

export interface EstadoDelPin {
  error?: string;
  aviso?: string;
}

/** Sin pase no hay nada que hacer acá: la clave (o Google) va primero. */
async function delPase() {
  const userId = await leerPaseActual();
  if (!userId) redirect("/admin/login");
  const tenantId = await getCurrentTenantId();
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId, active: true, deletedAt: null }, select: { id: true, tenantId: true, email: true, role: true } });
  return { tenantId, user };
}

export async function reenviarPin(): Promise<EstadoDelPin> {
  const { tenantId, user } = await delPase();
  const { mensaje } = await pedirPin(tenantId, user);
  return { aviso: mensaje };
}

export async function confirmarIngresoConPin(_previo: EstadoDelPin, formData: FormData): Promise<EstadoDelPin> {
  const { tenantId, user } = await delPase();
  const resultado = await confirmarPin(tenantId, user, String(formData.get("codigo") ?? "").slice(0, 20));
  if (!resultado.ok) return { error: resultado.error };
  if (!user) redirect("/admin/login");

  await abrirSesion(user.id);
  const destino = await destinoTrasIngreso(user, String(formData.get("next") ?? "/admin"));
  await quitarPase();
  redirect(destino);
}
