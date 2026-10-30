// SEO de base (ronda 2, P0): qué rutas de cada negocio se publican en el sitemap y cuáles se cierran en el robots.
// PURA: recibe el tipo de sitio ya resuelto (por rubro) y devuelve listas. La resolución con base vive en las rutas
// `src/app/robots.ts` y `src/app/sitemap.ts`.

/** Qué clase de sitio público tiene el host. `ninguno` = dirección sin negocio o base caída: no se indexa nada. */
export type TipoDeSitio = "tienda" | "servicios" | "taller" | "clases" | "inmobiliaria" | "estatico" | "producto" | "ninguno";

/** Lo que nunca se indexa, en ningún negocio: paneles, turnos y pedidos de una persona, pantallas de sistema. */
export const RUTAS_PRIVADAS: readonly string[] = [
  "/admin",
  "/operador",
  "/contador",
  "/api/",
  "/acceso",
  "/alumno",
  "/mis-clases",
  "/reserva/turno",
  "/reserva/confirmacion",
  "/taller/turno/",
  "/tienda/gracias",
  "/seguimiento",
  "/sin-negocio",
  "/sin-servicio",
];

/** ¿La ruta es de las que nunca se indexan? PURA. */
export function esRutaPrivada(ruta: string | null | undefined): boolean {
  const r = (ruta ?? "/").split(/[?#]/)[0];
  // Una entrada con barra final cierra sólo lo que cuelga de ella (`/taller/turno/<id>`, no el formulario `/taller/turno`).
  return RUTAS_PRIVADAS.some((p) => (p.endsWith("/") ? r.startsWith(p) : r === p || r.startsWith(`${p}/`)));
}

/** La portada pública de cada tipo de sitio (lo primero del sitemap). */
export function portadaDelSitio(tipo: TipoDeSitio, vidrieraDeProducto?: string | null): string | null {
  switch (tipo) {
    case "tienda": return "/tienda";
    case "taller": return "/taller";
    case "clases": return "/clases";
    case "inmobiliaria": return "/inmobiliaria";
    case "producto": return vidrieraDeProducto ?? null;
    case "servicios":
    case "estatico": return "/";
    case "ninguno": return null;
  }
}

/** Rutas del sitemap, sin origen. `extras`: fichas con URL propia (servicios de CH, páginas de un sitio estático). */
export function rutasDelSitemap(tipo: TipoDeSitio, extras: readonly string[] = [], vidrieraDeProducto?: string | null): string[] {
  const portada = portadaDelSitio(tipo, vidrieraDeProducto);
  if (!portada) return [];
  const base = tipo === "servicios" ? ["/", "/servicios", "/reserva"] : tipo === "taller" ? ["/taller", "/taller/turno"] : [portada];
  return [...new Set([...base, ...extras])].filter((r) => !esRutaPrivada(r));
}

/** El robots.txt del host: con negocio, todo menos lo privado; sin negocio, nada. */
export function reglasDelRobots(tipo: TipoDeSitio): { allow?: string; disallow: string | string[] } {
  return tipo === "ninguno" ? { disallow: "/" } : { allow: "/", disallow: [...RUTAS_PRIVADAS] };
}
