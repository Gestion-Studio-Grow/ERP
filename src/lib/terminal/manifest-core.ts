// Manifiesto de la app instalable del BACKOFFICE (/admin) por negocio — núcleo PURO (plan
// docs/producto/PLAN-TERMINALES-MOSTRADOR.md, fase T-5). Sin request, sin DB, sin Next: el route
// handler (src/app/api/pwa/admin.webmanifest/route.ts) resuelve el negocio por host y le pasa acá
// la marca ya resuelta. Así se testea la regla que importa —la marca de un negocio nunca aparece
// en otro (MT-1)— sin mockear nada.
//
// Sólo nombre, color e ícono: el manifiesto se baja SIN sesión (el navegador lo pide sin cookies),
// así que no lleva nada que no se pueda mostrar a cualquiera que tipee el host.

/** Lo único de la marca que el manifiesto necesita (subconjunto de `TenantBrand`). */
export type MarcaManifest = { name: string };

export type IconoManifest = {
  src: string;
  sizes: string;
  type: "image/png";
  purpose: "any" | "maskable";
};

export type ManifestAdmin = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone";
  lang: "es-AR";
  dir: "ltr";
  theme_color: string;
  background_color: string;
  icons: IconoManifest[];
};

/** La app instalada vive y se queda en el backoffice: nunca se abre "app" sobre la vidriera. */
export const SCOPE_ADMIN = "/admin";

/** Fondo de la pantalla de arranque: el hueso de la base (`--background`, globals.css:12). */
export const FONDO_NEUTRO = "#f6f3ec";

/** Ícono genérico (monograma neutro "•" sobre hueso) mientras el negocio no tenga el suyo. */
export const ICONOS_GENERICOS: readonly IconoManifest[] = [
  { src: "/gsg/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/gsg/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/gsg/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/**
 * Negocios que YA tienen `public/tenants/<slug>/icon-192.png` e `icon-512.png` (los agrega el preset
 * de cada negocio). Lista en código, revisada en un commit, igual que `HOSTS_PUBLICADOS` (MT-6): en
 * Vercel `public/` no viaja con la función, así que mirar el disco en runtime diría "no hay" siempre.
 * Hoy ninguno los tiene → todos usan el genérico. Sumar un slug acá SÓLO junto con sus dos PNG.
 */
export const NEGOCIOS_CON_ICONO_PROPIO: ReadonlySet<string> = new Set<string>([]);

/** Íconos del negocio: los suyos si están en la lista; si no, el genérico (nunca los de otro). */
export function iconosPara(
  slug: string | null,
  conIconoPropio: ReadonlySet<string> = NEGOCIOS_CON_ICONO_PROPIO,
): IconoManifest[] {
  if (!slug || !conIconoPropio.has(slug)) return ICONOS_GENERICOS.map((i) => ({ ...i }));
  const base = `/tenants/${slug}`;
  return [
    { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];
}

/**
 * Nombre corto bajo el ícono (≤ 12 caracteres, lo que muestran los launchers sin cortar): se
 * llevan palabras enteras mientras entren ("Break Point Pádel" → "Break Point"); si la primera ya
 * no entra, se corta ahí.
 */
export function nombreCorto(nombre: string, max = 12): string {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (limpio.length <= max) return limpio;
  let corto = "";
  for (const palabra of limpio.split(" ")) {
    const siguiente = corto ? `${corto} ${palabra}` : palabra;
    if (siguiente.length > max) break;
    corto = siguiente;
  }
  return corto || limpio.slice(0, max).trim();
}

/**
 * Arma el manifiesto del backoffice de UN negocio. `marca` sale de `brandForSlug` (sin ficha →
 * "Mi negocio", neutro); `acento` es el hex ya resuelto (`resolveAccent(preset, "light")`).
 * PURA: mismo input, mismo manifiesto.
 */
export function manifestDe(
  marca: MarcaManifest,
  acento: string,
  iconos: readonly IconoManifest[],
): ManifestAdmin {
  const name = marca.name.trim() || "Mi negocio";
  return {
    id: SCOPE_ADMIN,
    name,
    short_name: nombreCorto(name),
    description: "El panel del negocio a un toque: ventas, caja, clientes y turnos.",
    start_url: SCOPE_ADMIN,
    scope: SCOPE_ADMIN,
    display: "standalone",
    lang: "es-AR",
    dir: "ltr",
    theme_color: acento,
    background_color: FONDO_NEUTRO,
    icons: iconos.map((i) => ({ ...i })),
  };
}
