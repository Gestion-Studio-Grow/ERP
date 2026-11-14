import { presentaComoDemoGsg } from "@/lib/marca-demo";

// Imagen para compartir (og:image) por negocio (SEO ronda 2). 1200×630 WebP ≤ 80 KB, compuesta con material REAL del
// cliente (foto o logo que ya está en public/tenants). Mapa estático a propósito: en Vercel `public/` no se lee del
// disco en el servidor. Un negocio sin entrada no publica og:image (mejor nada que la de otro).
export const OG_POR_SLUG: Readonly<Record<string, { src: string; alt: string }>> = {
  magra: { src: "/tenants/magra/og-magra.webp", alt: "MAGRA Meat Market: packs de Estancia Don Ramón envasados al vacío" },
};

/** La og:image del negocio, o `null`. Los locales de una marca (magra-lomas…) usan la de su marca. PURA. */
export function ogDelNegocio(slug: string | null | undefined, marca?: string | null): { src: string; alt: string; width: 1200; height: 630 } | null {
  // DEMO GSG (src/lib/marca-demo.ts): sin la tarjeta del cliente al compartir.
  if (presentaComoDemoGsg(slug)) return null;
  const e = (slug && OG_POR_SLUG[slug]) || (marca && OG_POR_SLUG[marca]) || null;
  return e ? { ...e, width: 1200, height: 630 } : null;
}
