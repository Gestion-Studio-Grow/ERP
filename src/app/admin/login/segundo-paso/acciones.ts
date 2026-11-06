"use server";

import { redirect } from "next/navigation";
import { abrirSesion, destinoTrasIngreso } from "@/lib/ingreso.server";
import { prisma } from "@/lib/prisma";
import { comprobarCodigo, exigeSegundoPaso, leerPaseActual, quitarPase } from "@/lib/proyectos/segundo-factor.server";
import { getCurrentTenantId } from "@/lib/tenant";

export interface EstadoDelPaso {
  error?: string;
  codigos?: string[];
  destino?: string;
}

export async function confirmarSegundoPaso(_previo: EstadoDelPaso, formData: FormData): Promise<EstadoDelPaso> {
  const userId = await leerPaseActual();
  if (!userId) redirect("/admin/login");
  const tenantId = await getCurrentTenantId();
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId, active: true, deletedAt: null }, select: { id: true, tenantId: true, email: true, role: true } });
  if (!user) redirect("/admin/login");
  if (!(await exigeSegundoPaso(user))) redirect("/admin/login/pin");

  const resultado = await comprobarCodigo(user, String(formData.get("codigo") ?? "").slice(0, 40));
  if (!resultado.ok) return { error: resultado.error };

  await abrirSesion(user.id);
  const destino = await destinoTrasIngreso(user, String(formData.get("next") ?? "/admin"));
  // Recién activado: los códigos de respaldo se muestran una sola vez, antes de seguir. Tocar cookies hace que la página se
  // vuelva a pedir: el pase se queda hasta que venza, porque sin él esa página manda al ingreso y los códigos se perderían.
  if (resultado.codigos) return { codigos: resultado.codigos, destino };
  await quitarPase();
  redirect(destino);
}
