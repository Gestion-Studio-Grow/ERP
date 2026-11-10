// LA MARCA DE GSG (Gestión Studio Grow) en SVG: una sola fuente para el HTML estático de la página sin negocio, la
// firma «powered by GSG» del panel, los íconos de app y el de la pestaña. Marca madre v10 «Doble G» (09/11/2026,
// kit de GSG-MARCA-004): dos G que se encastran y comparten un nudo cobre. Forma en `currentColor` (el color lo pone
// quien la usa); el nudo y el ™ en cobre, que en oscuro sube a `--gsg-cobre` (globals.css). Todo en curvas: no
// depende de ninguna fuente. Tamaños mínimos de la marca: logo con nombre ≥ 56 px de alto (debajo, isotipo solo);
// isotipo completo ≥ 32 px; de 24 a 31 px la grilla de 32 y hasta 23 px la de 16 (los favicons).

/* Paleta de la marca madre (design-lint-ignore en cada línea: es la marca de GSG, no un color de interfaz). */
export const GSG_GRAFITO = "#1B1B1B"; // design-lint-ignore
export const GSG_PAPEL = "#F4F2EC"; // design-lint-ignore
export const GSG_COBRE = "#C8541F"; // design-lint-ignore
export const GSG_TINTA_OSCURO = "#EFEDE6"; // design-lint-ignore
export const GSG_FONDO_OSCURO = "#0E0F10"; // design-lint-ignore
export const GSG_COBRE_OSCURO = "#F0824C"; // design-lint-ignore

/** Relleno del nudo y del ™: la variable del tema (oscuro) con el cobre claro de respaldo. */
export const RELLENO_COBRE = `fill:var(--gsg-cobre,${GSG_COBRE})`;

export type GeometriaIsotipo = { viewBox: string; forma: string; nudo: string };

/** Isotipo completo (viewBox 100): desde 32 px. */
export const ISOTIPO_GSG: GeometriaIsotipo = {
  viewBox: "0 0 100 100",
  forma:
    "M5 5h50v10H5zM5 5h10v50H5zM5 45h50v10H5zM45 27h10v28H45zM25 27h30v10H25zM45 85h50v10H45zM85 45h10v50H85zM45 45h50v10H45zM45 45h10v28H45zM45 63h30v10H45z",
  nudo: "M45 45h10v10H45z",
};
/** Grilla de 32 (favicon 32): de 24 a 31 px. */
export const ISOTIPO_GSG_32: GeometriaIsotipo = {
  viewBox: "0 0 32 32",
  forma: "M2 2h16v3H2zM2 2h3v16H2zM2 14h28v4H2zM14 9h4v9h-4zM8 9h10v3H8zM14 27h16v3H14zM27 14h3v16h-3zM14 14h4v9h-4zM14 20h10v3H14z",
  nudo: "M14 14h4v4h-4z",
};
/** Grilla de 16 (favicon 16): hasta 23 px (la firma del panel va a 14). */
export const ISOTIPO_GSG_16: GeometriaIsotipo = {
  viewBox: "0 0 16 16",
  forma: "M1 1h7v3H1zM1 1h3v7H1zM8 12h7v3H8zM12 8h3v7h-3z",
  nudo: "M6 6h4v4H6z",
};

/** La geometría que corresponde a un tamaño en px (regla de tamaños mínimos de la marca). */
export function geometriaIsotipoGsg(tamano: number): GeometriaIsotipo {
  if (tamano >= 32) return ISOTIPO_GSG;
  return tamano >= 24 ? ISOTIPO_GSG_32 : ISOTIPO_GSG_16;
}

/** Logo v10 A2 (isotipo + «Gestión Studio Grow™» en tres líneas), 300×100, en curvas. */
export const LOGO_GSG_V10 = {
  viewBox: "0 0 300 100",
  ancho: 300,
  alto: 100,
  /** Dónde va el isotipo (viewBox 100) dentro del logo. */
  isotipo: "translate(24 14) scale(.72)",
  nombre:
    "M123 33.3q-1.7 0-3-.7-1.3-.7-2-2.1-.8-1.4-.8-3.4v-3.6q0-3 1.7-4.6 1.6-1.6 4.4-1.6 2.8 0 4.3 1.5 1.5 1.5 1.5 4v.1h-2.4v-.1q0-1-.3-1.7-.4-.8-1.2-1.2-.7-.5-1.9-.5-1.7 0-2.7 1-1 1.2-1 3v3.8q0 1.8 1 3 1 1 2.8 1 1.7 0 2.5-1 .8-1 .8-2.5v-.3h-4.1v-2h6.5V33h-2.2v-1.6h-.4l-.5.9q-.4.4-1.1.7-.8.3-2 .3m14 0q-1.7 0-3-.7-1.2-.7-1.8-2-.7-1.2-.7-2.9v-.2q0-1.7.7-3 .6-1.3 1.9-2 1.2-.6 2.8-.6 1.5 0 2.7.6 1.2.7 1.8 2 .7 1.2.7 2.9v.8h-8.3q0 1.4 1 2.3.8.8 2.2.8 1.3 0 2-.5.6-.6 1-1.4l1.8 1-.9 1.3q-.6.7-1.5 1.2-1 .4-2.4.4m-3.2-6.8h6q0-1.3-.9-2-.8-.6-2-.6-1.3 0-2.1.6-.8.7-1 2m15.3 6.8q-2.1 0-3.5-1-1.3-.8-1.6-2.7l2-.5q.3.9.7 1.4.4.5 1 .8.6.2 1.4.2 1 0 1.6-.4.6-.5.6-1.1 0-.7-.5-1-.6-.3-1.7-.5l-.7-.1q-1.1-.2-2-.6-1-.4-1.5-1-.5-.7-.5-1.7 0-1.6 1.2-2.4 1.1-.8 3-.8 1.8 0 3 .8 1.2.8 1.5 2.2l-2 .6q-.3-1-1-1.4-.5-.4-1.5-.4-1 0-1.4.3-.6.4-.6 1 0 .6.5 1 .6.3 1.4.4l.8.2q1.2.1 2.1.5 1 .4 1.6 1 .5.7.5 1.8 0 1.6-1.2 2.5-1.2 1-3.2 1m13.5-.3h-3q-1 0-1.6-.6-.6-.6-.6-1.6v-6.7h-3v-2h3v-3.5h2.3V22h3.2v2h-3.2v6.3q0 .7.6.7h2.3zm5 0h-2.2V22.1h2.2zm-1.1-12.3q-.7 0-1.1-.4-.5-.5-.5-1.2 0-.6.5-1 .4-.5 1-.5.8 0 1.2.4.5.5.5 1.1 0 .7-.5 1.1-.4.5-1.1.5m9.6 12.6q-1.7 0-3-.7-1.2-.6-2-1.9-.7-1.2-.7-3v-.3q0-1.7.8-3 .7-1.2 2-1.9 1.2-.6 2.9-.6 1.6 0 2.9.6 1.2.7 2 2 .7 1.2.7 3v.2q0 1.8-.7 3-.8 1.3-2 2-1.3.6-3 .6m0-2q1.5 0 2.4-1 1-1 1-2.6v-.2q0-1.7-1-2.7-1-1-2.4-1-1.5 0-2.4 1-1 1-1 2.7v.2q0 1.7 1 2.6.9 1 2.4 1m.6-10.5h-2l1.6-3.1h2.6zm9.6 12.2h-2.2V22.1h2.2v1.7h.3q.3-.7 1.1-1.2.8-.6 2.4-.6 1.2 0 2.2.5 1 .6 1.5 1.6.5 1 .5 2.4V33h-2.2v-6.3q0-1.4-.7-2.1-.7-.7-2-.7-1.4 0-2.2 1-.9.9-.9 2.6zm-63.5 25q-1.7 0-3-.6-1.4-.6-2.1-1.8-.8-1.2-.8-3v-.5h2.4v.6q0 1.6 1 2.4 1 .8 2.5.8 1.7 0 2.5-.7.9-.7.9-1.8 0-.7-.4-1.2-.4-.4-1.1-.7l-1.8-.5-.8-.2q-1.5-.4-2.6-.9-1-.5-1.7-1.4-.5-.8-.5-2.1 0-1.4.6-2.4.7-1 1.9-1.5 1.2-.5 2.8-.5 1.6 0 2.9.5 1.2.6 2 1.7.7 1 .7 2.7v.8h-2.4v-.8q0-1-.4-1.6-.4-.6-1.1-1-.7-.2-1.7-.2-1.4 0-2.2.6-.8.5-.8 1.6 0 .7.4 1.1.3.5 1 .8.6.3 1.6.5l.8.2q1.5.3 2.6.8 1.2.5 1.9 1.4.6.9.6 2.3 0 1.4-.7 2.4-.7 1-2 1.6-1.2.6-3 .6m14.8-.3h-3q-1 0-1.6-.6-.6-.6-.6-1.6v-6.7h-3v-2h3v-3.5h2.3v3.6h3.2v1.9h-3.2V55q0 .7.6.7h2.3zm7 .2q-1.3 0-2.3-.5-1-.6-1.5-1.6-.5-1-.5-2.4v-6.5h2.2v6.3q0 1.4.7 2 .7.8 2 .8 1.4 0 2.2-1 .9-1 .9-2.7V47h2.2v10.8h-2.2v-1.6h-.3q-.3.6-1.1 1.2-.8.6-2.4.6m13.6.1q-1.4 0-2.5-.6-1.2-.7-1.9-2-.7-1.2-.7-3v-.3q0-1.7.7-3 .7-1.2 1.8-1.9 1.2-.7 2.6-.7 1 0 1.7.3l1.2.7q.5.4.7.8h.4v-6h2.2v15.4h-2.2v-1.5h-.3q-.5.7-1.3 1.2-.9.6-2.4.6m.6-2q1.5 0 2.4-1 1-.9 1-2.6v-.2q0-1.8-1-2.7-1-1-2.4-1-1.5 0-2.4 1-1 1-1 2.7v.2q0 1.7 1 2.7 1 1 2.4 1m11 1.7h-2.2V46.8h2.2zm-1.1-12.3q-.7 0-1.1-.4-.5-.5-.5-1.2 0-.6.5-1 .4-.5 1-.5.8 0 1.2.4.4.5.4 1.1 0 .7-.4 1.2-.4.4-1.1.4M178 58q-1.6 0-2.8-.7-1.3-.6-2-1.9-.8-1.2-.8-3v-.3q0-1.7.8-3 .7-1.2 2-1.9 1.2-.7 2.8-.7 1.7 0 3 .7 1.2.7 2 2 .7 1.2.7 3v.2q0 1.8-.7 3-.8 1.3-2 2-1.3.6-3 .6m0-2q1.5 0 2.5-1 1-1 1-2.6v-.2q0-1.7-1-2.7-1-1-2.5-1-1.4 0-2.4 1-.9 1-.9 2.7v.2q0 1.7 1 2.6.9 1 2.3 1m-55 26.7q-1.7 0-3-.7-1.3-.7-2-2.1-.8-1.4-.8-3.4v-3.6q0-3 1.7-4.6 1.6-1.6 4.4-1.6 2.8 0 4.3 1.5 1.5 1.5 1.5 4v.1h-2.4v-.1q0-1-.3-1.7-.4-.8-1.2-1.2-.7-.5-1.9-.5-1.7 0-2.7 1-1 1.2-1 3v3.8q0 1.8 1 3 1 1 2.8 1 1.7 0 2.5-1 .8-1 .8-2.5v-.3h-4.1v-2h6.5v7.6h-2.2v-1.6h-.4l-.5.9q-.4.4-1.1.7-.8.3-2 .3m10.8-.3h-2.2V71.5h2.2v1.3h.3q.3-.6.9-1 .6-.3 1.4-.3h1.3v2h-1.4q-1 0-1.8.7-.7.6-.7 1.8zm10.7.3q-1.6 0-2.9-.7-1.2-.6-2-1.9-.7-1.2-.7-3v-.3q0-1.7.8-3 .7-1.2 2-1.9 1.2-.7 2.8-.7 1.7 0 3 .7 1.2.7 2 2 .7 1.2.7 3v.2q0 1.8-.8 3-.7 1.3-2 2-1.2.6-2.9.6m0-2q1.5 0 2.5-1 .9-1 .9-2.6v-.2q0-1.7-1-2.7-.8-1-2.4-1-1.4 0-2.4 1-1 1-1 2.7v.2q0 1.7 1 2.6 1 1 2.4 1m12.8 1.7h-3.8l-1.9-10.9h2.3l1.4 9.4h.3l2-9.4h3.6L163 81h.3l1.4-9.4h2.2l-1.8 10.9h-3.8l-1.9-9.3h-.3z",
  tm: "M170.3 70.9h-.3V69h.6l.4 1.6.5-1.6h.6V71h-.3v-1.6h-.1l-.4 1.6h-.5l-.4-1.6zm-1.2 0h-.3v-1.6h-.7V69h1.6v.3h-.6z",
} as const;

/** Alto mínimo del logo con nombre; debajo se usa el isotipo solo. */
export const LOGO_GSG_ALTO_MINIMO = 56;

const TITULO = "Gestión Studio Grow™";

/** Isotipo como SVG en texto (HTML estático), con la geometría de su tamaño. */
export function isotipoGsgSvg({ tamano = 32, titulo = true }: { tamano?: number; titulo?: boolean } = {}): string {
  const g = geometriaIsotipoGsg(tamano);
  const crisp = g === ISOTIPO_GSG ? "" : ` shape-rendering="crispEdges"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}" width="${tamano}" height="${tamano}"${crisp}` +
    (titulo ? ` role="img" aria-label="${TITULO}">` : ` aria-hidden="true">`) +
    `<path fill="currentColor" d="${g.forma}"/><path style="${RELLENO_COBRE}" d="${g.nudo}"/></svg>`
  );
}

/** Logo completo en texto (HTML estático). Debajo de 56 px de alto devuelve el isotipo solo. */
export function logoGsgSvg({ alto = LOGO_GSG_ALTO_MINIMO, idTitulo = "gsg-t" }: { alto?: number; idTitulo?: string } = {}): string {
  if (alto < LOGO_GSG_ALTO_MINIMO) return isotipoGsgSvg({ tamano: alto });
  const L = LOGO_GSG_V10;
  const ancho = Math.round((alto * L.ancho) / L.alto);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${L.viewBox}" width="${ancho}" height="${alto}" role="img" aria-labelledby="${idTitulo}">` +
    `<title id="${idTitulo}">${TITULO}</title>` +
    `<g transform="${L.isotipo}"><path fill="currentColor" d="${ISOTIPO_GSG.forma}"/><path style="${RELLENO_COBRE}" d="${ISOTIPO_GSG.nudo}"/></g>` +
    `<path fill="currentColor" d="${L.nombre}"/><path style="${RELLENO_COBRE}" d="${L.tm}"/></svg>`
  );
}

/** Favicon 32 con la grilla de 32 y los dos temas del sistema (prefers-color-scheme), sin fondo. */
export function faviconGsgSvg(): string {
  const g = ISOTIPO_GSG_32;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${g.viewBox}' width='32' height='32' shape-rendering='crispEdges'>` +
    `<style>.f{fill:${GSG_GRAFITO}}.k{fill:${GSG_COBRE}}@media (prefers-color-scheme:dark){.f{fill:${GSG_TINTA_OSCURO}}.k{fill:${GSG_COBRE_OSCURO}}}</style>` +
    `<path class='f' d='${g.forma}'/><path class='k' d='${g.nudo}'/></svg>`
  );
}

/** Ícono de la pestaña (favicon 32): data-URI listo para `icons.icon` y para el <link rel="icon"> estático. */
export function faviconGsgDataUri(): string {
  return `data:image/svg+xml,${encodeURIComponent(faviconGsgSvg())}`;
}

/**
 * Ícono de app (PWA): el isotipo sobre papel, cuadrado y sin transparencia. `zonaSegura` = maskable: el dibujo
 * achicado al 50 % del lado para que ningún recorte (círculo, squircle) lo toque; normal, 62 %.
 */
export function iconoAppGsgSvg({ zonaSegura = false }: { zonaSegura?: boolean } = {}): string {
  const caja = zonaSegura ? 500 : 620;
  const o = (1000 - caja) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" fill="${GSG_PAPEL}"/>` +
    `<g transform="translate(${o} ${o}) scale(${caja / 100})"><path fill="${GSG_GRAFITO}" d="${ISOTIPO_GSG.forma}"/><path fill="${GSG_COBRE}" d="${ISOTIPO_GSG.nudo}"/></g></svg>`
  );
}
