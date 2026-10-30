// sitemap.xml POR HOST (SEO ronda 2, P0): la portada del rubro (tienda, taller, clases, servicios), las fichas con URL
// propia (servicios de CH) y las páginas de un sitio estático. Sin negocio o con la base caída: vacío.
import type { MetadataRoute } from "next";
import { pedidoPublico, canonicalDe } from "@/lib/seo/base";
import { rutasDelSitemap } from "@/lib/seo/sitio";
import { sitioDelPedido } from "@/lib/seo/tipo-de-sitio";
import { getPublicBookingData } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ origen }, sitio] = await Promise.all([pedidoPublico(), sitioDelPedido()]);
  if (!origen || sitio.tipo === "ninguno") return [];
  let extras: string[] = sitio.paginasEstaticas;
  if (sitio.tipo === "servicios") {
    // Fichas de servicio con URL propia (/servicios/[id]). Si la lectura falla, el sitemap sale igual sin ellas.
    const data = await getPublicBookingData().catch(() => null);
    extras = (data?.groups ?? []).flatMap((g) => g.services.map((s) => `/servicios/${s.id}`));
  }
  const ahora = new Date();
  return rutasDelSitemap(sitio.tipo, extras, sitio.vidriera).map((ruta, i) => ({
    url: canonicalDe(origen, ruta),
    lastModified: ahora,
    changeFrequency: i === 0 ? "daily" : "weekly",
    priority: i === 0 ? 1 : 0.6,
  }));
}
