// LA METADATA DEL DISEÑO NUEVO DE CH (P0-5, ronda 2): título con el nombre del negocio, descripción real y la tarjeta para
// compartir. Sólo la usan las páginas con «Diseño nuevo» prendido: apagado, CH sigue con la de siempre (el OK a los textos
// de esta tarjeta lo da la clienta al prender). Por eso la imagen no está en OG_POR_SLUG (eso la publicaría prendido o no).
//
// El openGraph de una página REEMPLAZA entero al del layout raíz (Next no los mezcla): se repiten tipo, sitio y URL. Las
// URL absolutas salen del host del pedido (src/lib/seo/base.ts), nunca de una constante.

import "server-only";
import type { Metadata } from "next";
import { getTenantBrand } from "@/lib/branding";
import { getLocation } from "@/lib/settings";
import { canonicalDe, pedidoPublico } from "@/lib/seo/base";
import { negocioLd, type Negocio } from "@/lib/seo/jsonld";
import { chConDisenoNuevo } from "./diseno-ch.server";

/** La tarjeta para compartir de CH: composición de marca (provisional a confirmar hasta tener foto del local). */
export const OG_CH = { url: "/tenants/ch/og-ch.webp", width: 1200, height: 630, alt: "CH Estética: estética y spa en La Alameda", type: "image/webp" } as const;

export async function nombreDelNegocioCH(): Promise<string> {
  return (await getTenantBrand()).name;
}

export async function metadataCH(m: { titulo: string; descripcion: string }): Promise<Metadata> {
  const [{ origen, ruta }, nombre] = await Promise.all([pedidoPublico(), nombreDelNegocioCH()]);
  const url = origen ? canonicalDe(origen, ruta) : undefined;
  return {
    title: m.titulo,
    description: m.descripcion,
    ...(origen ? { metadataBase: new URL(origen) } : {}),
    openGraph: { type: "website", locale: "es_AR", siteName: nombre, title: m.titulo, description: m.descripcion, ...(url ? { url } : {}), images: [OG_CH] },
    twitter: { card: "summary_large_image", title: m.titulo, description: m.descripcion },
  };
}

export const DESCRIPCION_CH = "Estética y spa en La Alameda, Canning. Precio exacto, horario libre y quién te atiende. Reservás online en un minuto.";

/** La metadata de la portada del sitio (la reexporta `(site)/page.tsx`). Apagado o cualquier otro negocio: `{}`, la de siempre. */
export async function generateMetadata(): Promise<Metadata> {
  if (!(await chConDisenoNuevo())) return {};
  return metadataCH({ titulo: `${await nombreDelNegocioCH()} · Estética y spa en La Alameda`, descripcion: DESCRIPCION_CH });
}

/** El JSON-LD del negocio con los datos cargados en Localización: lo que falta no se publica. */
export async function negocioLdCH(descripcion: string): Promise<Record<string, unknown> | null> {
  const [{ origen }, nombre, lugar] = await Promise.all([pedidoPublico(), nombreDelNegocioCH(), getLocation()]);
  if (!origen) return null;
  const n: Negocio = {
    nombre,
    url: origen,
    descripcion,
    imagen: `${origen}${OG_CH.url}`,
    telefono: lugar.whatsapp ? `+${lugar.whatsapp.startsWith("54") ? lugar.whatsapp : `54${lugar.whatsapp}`}` : null,
    email: lugar.email,
    direccion: { calle: lugar.addressLine, ciudad: lugar.city },
    redes: lugar.instagramUrl ? [lugar.instagramUrl] : null,
  };
  return negocioLd("HealthAndBeautyBusiness", n);
}
