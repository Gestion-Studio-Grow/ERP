// robots.txt POR HOST (SEO ronda 2, P0). Cada negocio publica su sitio y cierra paneles, turnos y pedidos de una persona;
// una dirección sin negocio (o con la base caída) no publica nada. Ver src/lib/seo/sitio.ts.
import type { MetadataRoute } from "next";
import { pedidoPublico } from "@/lib/seo/base";
import { reglasDelRobots } from "@/lib/seo/sitio";
import { sitioDelPedido } from "@/lib/seo/tipo-de-sitio";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const [{ origen }, { tipo }] = await Promise.all([pedidoPublico(), sitioDelPedido()]);
  return {
    rules: { userAgent: "*", ...reglasDelRobots(tipo) },
    ...(origen && tipo !== "ninguno" ? { sitemap: `${origen}/sitemap.xml`, host: origen } : {}),
  };
}
