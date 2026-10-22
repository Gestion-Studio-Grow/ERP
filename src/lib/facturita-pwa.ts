/**
 * FACTURITA · App instalable (PWA) — núcleo PURO: el manifiesto y las rutas del service worker.
 *
 * Por qué Facturita SÍ tiene service worker y el backoffice no (src/app/api/pwa/admin.webmanifest):
 * el de acá está acotado a `/facturita/` y es MÍNIMO a propósito — sólo guarda la página «sin
 * conexión» y los íconos, que son estáticos y públicos. Nunca guarda una navegación, una respuesta
 * de la app con sesión, una server action ni un dato fiscal: todo eso va siempre a la red. Así se
 * evitan los tres riesgos que anota el manifiesto del backoffice (otro negocio en el mismo origen,
 * equipo compartido, bundle viejo contra actions nuevas). Ver public/facturita/sw.js.
 *
 * El manifiesto es de PRODUCTO (Facturita es una marca de GSG, igual para todos), no de negocio:
 * por eso es estático y no depende del host (a diferencia del de /admin, MT-1).
 */

/** Dónde vive la app instalada: todo Facturita (vidriera, alta y app). */
export const SCOPE_FACTURITA = "/facturita/";

/** Al abrir la app instalada se cae directo en «Emitir» (si no hay sesión, el login la manda ahí). */
export const START_URL_FACTURITA = "/facturita/app";

export const MANIFEST_FACTURITA_URL = "/facturita/manifest.webmanifest";
export const SW_FACTURITA_URL = "/facturita/sw.js";
export const OFFLINE_FACTURITA_URL = "/facturita/sin-conexion.html";

/**
 * Colores de la barra del sistema y de la pantalla de arranque. Salen del acento «ámbar» de
 * Facturita (src/lib/producto-identidad.ts → src/lib/branding.ts ACCENT_PRESETS.ambar) y del
 * lienzo de la piel Fable (globals.css `[data-skin="fable"] --surface`). El manifiesto no puede
 * leer variables CSS, por eso van como valor.
 */
export const THEME_COLOR_FACTURITA = "#9a6a1f"; // design-lint-ignore: el manifiesto no lee variables CSS; espeja ACCENT_PRESETS.ambar.light (lo vigila facturita-pwa.test.ts)
export const THEME_COLOR_FACTURITA_OSCURO = "#15140f";
export const FONDO_FACTURITA = "#f5f5f7";

export type IconoFacturita = {
  src: string;
  sizes: string;
  type: "image/png" | "image/svg+xml";
  purpose: "any" | "maskable";
};

export const ICONOS_FACTURITA: readonly IconoFacturita[] = [
  { src: "/facturita/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/facturita/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/facturita/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  { src: "/facturita/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
];

export const APPLE_TOUCH_ICON_FACTURITA = "/facturita/apple-touch-icon.png";

export type ManifestFacturita = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: "es-AR";
  dir: "ltr";
  start_url: string;
  scope: string;
  display: "standalone";
  orientation: "portrait";
  theme_color: string;
  background_color: string;
  categories: string[];
  icons: IconoFacturita[];
  shortcuts: { name: string; short_name: string; url: string; icons: IconoFacturita[] }[];
};

export function manifestFacturita(): ManifestFacturita {
  const icono192 = ICONOS_FACTURITA[0];
  return {
    id: START_URL_FACTURITA,
    name: "Facturita — tus facturas de ARCA en el celu",
    short_name: "Facturita",
    description:
      "Emití facturas con validez de ARCA en tres toques. Gratis hasta 5 por mes, para monotributistas y comercios chicos.",
    lang: "es-AR",
    dir: "ltr",
    start_url: START_URL_FACTURITA,
    scope: SCOPE_FACTURITA,
    display: "standalone",
    orientation: "portrait",
    theme_color: THEME_COLOR_FACTURITA,
    background_color: FONDO_FACTURITA,
    categories: ["business", "finance", "productivity"],
    icons: ICONOS_FACTURITA.map((i) => ({ ...i })),
    shortcuts: [
      { name: "Emitir una factura", short_name: "Emitir", url: START_URL_FACTURITA, icons: [{ ...icono192 }] },
      { name: "Mis facturas", short_name: "Facturas", url: "/facturita/app/facturas", icons: [{ ...icono192 }] },
    ],
  };
}
