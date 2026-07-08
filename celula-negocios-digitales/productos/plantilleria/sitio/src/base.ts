// Prefijo de montaje del sitio (fuente única de verdad de rutas).
//
// - "/plantilleria"  → montado como assets estáticos DENTRO de la app ERP
//                      (public/plantilleria/**), servido bajo gsg.../plantilleria.
// - ""               → publicado STANDALONE en la raíz de un host de estáticos
//                      (Netlify/Vercel, ver PUBLICAR.md). Cambiar SOLO esta línea.
//
// Se importa desde render.ts (build con tsx) y client.ts (bundle esbuild): en ambos
// casos el valor queda inlineado, sin envs ni flags de build. Reversible en 1 línea.
export const BASE = "/plantilleria";

/** Une el prefijo con una ruta absoluta del sitio ("/carrito" → "/plantilleria/carrito"). */
export function ruta(path: string): string {
  if (path === "/") return BASE || "/";
  return `${BASE}${path}`;
}
