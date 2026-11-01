// COPY DE CH ESTÉTICA (P0 ronda 2, fail-open). El texto, las fotos y los nombres del equipo de CH vivían en la portada
// genérica del sitio (src/app/(site)/page.tsx), gateados por `esCH`. Con la base caída esa portada era lo que veía
// cualquier host. Ahora viven acá, junto al resto de lo de CH, y la portada sólo los usa cuando el negocio ES CH.

/** Titular y bajada de la landing de CH (diseño de siempre, con el interruptor «Diseño nuevo» apagado). */
export const HERO_CH = {
  titulo: "Estética y spa en La Alameda.",
  bajada: "Mirá los precios y pedí tu turno. Atienden Carolina, Macarena y Romina.",
} as const;

/** Foto real de la cabina de CH (asset del proyecto en /public). */
export const FOTO_CABINA_CH = {
  src: "/tenants/ch-hero-spa.jpg",
  alt: "Cabina de spa de CH Estética: lino color crema sobre la camilla, plantas naturales y luz cálida de tarde entrando por la ventana",
} as const;

// Fotos reales del equipo (reemplazan el placeholder ilustrado apenas están disponibles). Mapeadas por nombre porque
// todavía no hay un campo de foto en el modelo Professional — si el nombre no matchea, cae al ilustrado.
export const FOTOS_EQUIPO_CH: Record<string, { src: string; rotate?: number }> = {
  "Carolina Haponiuk": { src: "/team/carolina.png" },
  "Macarena Arias": { src: "/team/macarena.png" },
  "Romina Delpardo": { src: "/team/romina.png", rotate: 90 },
};

/** «Otros servicios» es el grupo de los servicios sin categoría (getPublicBookingData): no se le muestra como categoría. */
export function categoriaVisible(nombre: string | null | undefined): boolean {
  const n = (nombre ?? "").trim().toLowerCase();
  return n !== "" && n !== "otros servicios";
}
