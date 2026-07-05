import { cache } from "react";
import { prisma } from "@/lib/prisma";

// Acento de MARCA por TENANT (FUNDAMENTOS-Y-VISION: un core, marca por tenant).
//
// El look base del ERP es "B / Studio SaaS": superficies claras y frías,
// neutrales y profesionales, iguales para todos los tenants. Lo único que cambia
// por tenant es el COLOR DE ACENTO (CTAs, foco, estados activos, chips): el salón
// usa su petróleo, la carnicería su oxblood, etc. — todos sobre la misma base.
//
// El acento NO se hardcodea en tokens ni en componentes: se resuelve acá y se
// inyecta como la CSS var `--accent` en un contenedor por tenant (ver los
// layouts admin y site). Como en globals.css `--accent-hover` y `--accent-soft`
// se derivan de `--accent` con color-mix, basta inyectar un solo color.
//
// HOY el mapa vive en código (por slug) a propósito: agregar `accentColor` a
// BusinessSettings implicaría una migración de la base de producción (Neon), que
// está fuera de alcance de este pase. Cuando esa columna se despliegue, este
// resolver pasa a leerla con fallback a este mapa — un único punto de cambio.
const ACCENT_BY_SLUG: Record<string, string> = {
  "beauty-spa": "#2c6e77", // CH Estética — petróleo de marca
  "magra": "#7b2d3b", // Magra (carnicería) — oxblood
};

// Default neutro del ERP (índigo de la dirección B) para cualquier tenant sin
// acento configurado.
export const DEFAULT_ACCENT = "#4f46e5";

// Cacheado por request (React.cache): varios layouts pueden pedirlo sin duplicar
// el lookup. Fail-open a propósito: el acento es cosmético, nunca debe tumbar el
// render. Sin DB disponible (build / entorno sin base) cae al default.
export const getTenantAccent = cache(async (): Promise<string> => {
  try {
    const tenant = await prisma.tenant.findFirst({ select: { slug: true } });
    if (tenant && ACCENT_BY_SLUG[tenant.slug]) return ACCENT_BY_SLUG[tenant.slug];
    return DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
});
