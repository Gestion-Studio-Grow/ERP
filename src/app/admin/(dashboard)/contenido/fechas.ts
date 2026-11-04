// Helpers puros de la pantalla de Contenido (testeados en fechas.test.ts).

/** «YYYY-MM-DD» de hoy en Argentina, sin depender de la zona horaria del servidor. */
export function hoyEnArgentina(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/** El slug con que se guarda el modo demo (`gsg:contenido:<slug>`): el del negocio o, si no hay, uno sacado de su id. */
export function slugDelAlmacen(slug: string | null, tenantId: string): string {
  const limpio = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+/, "").slice(0, 63);
  return (slug && limpio(slug)) || limpio(`t-${tenantId}`) || "negocio";
}

/** Enlace para abrir WhatsApp con el texto listo (para un estado o para elegir el chat). */
export const compartirPorWhatsApp = (texto: string): string => `https://wa.me/?text=${encodeURIComponent(texto)}`;
