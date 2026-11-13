"use server";

// «Entregué» del repartidor: endpoint PÚBLICO (sin sesión). Todo lo decide el token y el host;
// ver datos.ts y src/lib/delivery-local/entrega.ts. No cambia el estado del pedido.

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { repartidorEntrego, type ResultadoDeLaEntrega } from "@/lib/delivery-local/entrega";
import { contextoDeLaEntrega, depsDeLaEntrega } from "./datos";

export async function marcarEntregado(token: string): Promise<ResultadoDeLaEntrega> {
  const ctx = await contextoDeLaEntrega(token);
  try {
    const r = await repartidorEntrego(ctx, depsDeLaEntrega);
    if (r.ok) revalidatePath("/admin/pedidos");
    return r;
  } catch (err) {
    logger.error("delivery-local", "no se pudo grabar el «Entregué» del repartidor", err, { tenantId: ctx.tenantId });
    return { ok: false, error: "No pudimos avisarle al local ahora. Probá de nuevo en un momento o avisale por WhatsApp." };
  }
}
