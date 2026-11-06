"use server";
// FACTOQUE · Desconectar Mercado Pago (server action). Conectar es una navegación (ruta
// /facturita/app/cuenta/mercadopago/conectar), no una acción: el OAuth es ida y vuelta a MP.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionFacturita } from "@/lib/facturita-sesion.server";
import { desconectarMP } from "@/lib/facturita-mp.server";
import { RUTA_CUENTA } from "@/lib/facturita-mp-flujo";

export async function desconectarMercadoPagoAction(): Promise<void> {
  const { tenantId, userId } = await sesionFacturita();
  await desconectarMP(tenantId, userId);
  revalidatePath(RUTA_CUENTA);
  redirect(`${RUTA_CUENTA}?mp=desconectado`);
}
