// ============================================================================
// ¿ESTE PEDIDO ES CH CON EL DISEÑO NUEVO? (servidor)
// ============================================================================
//
// El corte de siempre (slug `beauty-spa`, E1: nada de CH para otro negocio) Y el interruptor «Diseño nuevo»
// del negocio (`disenoNuevo()`, una lectura cacheada por pedido; si falla, APAGADO). Para cualquier otro
// negocio ni siquiera se lee el interruptor. Lo usan el layout del sitio, la carta, la ficha y /reserva.

import "server-only";
import { cache } from "react";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { disenoNuevo } from "@/lib/diseno/diseno.server";

export const chConDisenoNuevo = cache(async (): Promise<boolean> => {
  try {
    if ((await getCurrentTenantSlug()) !== "beauty-spa") return false;
    return await disenoNuevo();
  } catch {
    return false;
  }
});
