// SEO de base (ronda 2, P0): qué sitio público tiene el host del pedido. Misma resolución que el layout raíz y la portada
// (`estadoDeLaDireccion` + `getTenantIdentity`), así el robots y el sitemap dicen lo mismo que la página. Sin negocio o
// con la base caída → `ninguno` (no se indexa nada: nunca se publica el sitemap de otro negocio por fail-open).
import { cache } from "react";
import { headers } from "next/headers";
import { estadoDeLaDireccion } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { vidrieraDelHost } from "@/lib/producto-host";
import { esApexDelDominio } from "@/proxy";
import { SITIOS_ESTATICOS } from "@/lib/sitio-estatico";
import type { TipoDeSitio } from "./sitio";

export type SitioDelPedido = { tipo: TipoDeSitio; slug: string | null; vidriera: string | null; paginasEstaticas: string[] };

/** Resolución PURA a partir de lo ya leído. Es lo que se testea. */
export function tipoDeSitio(d: {
  vidrieraDeProducto: string | null;
  esApex: boolean;
  estado: "negocio" | "sin-negocio" | "sin-servicio";
  slug: string | null;
  blueprintId: string | null;
  isRetail: boolean;
  esSitioEstatico: boolean;
}): TipoDeSitio {
  if (d.vidrieraDeProducto) return "producto";
  if (d.esApex || d.estado !== "negocio") return "ninguno";
  if (d.esSitioEstatico) return "estatico";
  if (d.isRetail) return "tienda";
  if (d.blueprintId === "taller") return "taller";
  if (d.blueprintId === "profe-padel") return "clases";
  if (d.blueprintId === "inmobiliaria") return "inmobiliaria";
  return "servicios";
}

export const sitioDelPedido = cache(async (): Promise<SitioDelPedido> => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const vidriera = vidrieraDelHost(host);
  const esApex = esApexDelDominio(host);
  const estado = vidriera || esApex ? "sin-negocio" : await estadoDeLaDireccion();
  const identity = estado === "negocio" ? await getTenantIdentity() : null;
  const estatico = identity?.slug ? SITIOS_ESTATICOS.find((s) => s.slug === identity.slug) ?? null : null;
  const tipo = tipoDeSitio({
    vidrieraDeProducto: vidriera,
    esApex,
    estado,
    slug: identity?.slug ?? null,
    blueprintId: identity?.blueprintId ?? null,
    isRetail: identity?.isRetail ?? false,
    esSitioEstatico: !!estatico,
  });
  // Del sitio estático se publican sus PÁGINAS (html), no adjuntos ni imágenes.
  const paginasEstaticas = estatico
    ? Object.entries(estatico.archivos).filter(([, a]) => a.tipo.startsWith("text/html") && a.indexable !== false).map(([ruta]) => `/${ruta}`)
    : [];
  return { tipo, slug: identity?.slug ?? null, vidriera, paginasEstaticas };
});
