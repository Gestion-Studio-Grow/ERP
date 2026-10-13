// Lo que necesita cualquier página pública de la inmobiliaria: de qué negocio es el dominio,
// sus datos, su marca y su configuración. Devuelve null si el negocio no es una inmobiliaria:
// esas páginas no existen para el resto de los rubros.

import "server-only";
import { cache } from "react";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { configInmo, negocioInmo } from "./datos.server";
import { marcaInmo } from "./marca";

export const sitioInmo = cache(async () => {
  const identity = await getTenantIdentity();
  if (identity.blueprintId !== "inmobiliaria") return null;
  const tenantId = await getCurrentTenantId();
  const [negocio, config] = await Promise.all([negocioInmo(tenantId), configInmo(tenantId)]);
  return { tenantId, negocio, config, marca: marcaInmo(negocio.slug) };
});

/** La dirección pública del sitio, para links absolutos (compartir, buscadores). */
export async function origenDelSitio(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}
