/**
 * FACTOQUE · Marca F06-A (09/11/2026, kit de GSG-MARCA-004) — fuente ÚNICA del dibujo.
 *
 * El isotipo es un talonario visto de frente (marco abierto abajo, dos renglones) con el nudo cobre de la casa
 * madre: Factoque es un producto de Gestión Studio Grow y comparte su paleta (src/lib/gsg/marca-svg.ts). De acá
 * salen el favicon SVG, el logo de la barra de la vidriera y, con next/og (ImageResponse), los PNG de la app
 * instalable y la imagen para compartir: nada binario en Git (norma GSG), todo se genera en el build.
 * Módulo PURO (sólo importa la paleta, también pura): lo pueden usar server components, rutas y tests.
 * Tamaños mínimos: barra (isotipo + nombre) ≥ 44 px de alto; horizontal con «Powered by…» ≥ 88 px.
 */

import { GSG_COBRE, GSG_COBRE_OSCURO, GSG_FONDO_OSCURO, GSG_GRAFITO, GSG_PAPEL, GSG_TINTA_OSCURO } from "./gsg/marca-svg";

/** Paleta de Factoque: la de la casa madre (grafito, papel, cobre) y un gris para el respaldo. */
export const FACTOQUE_TINTA = GSG_GRAFITO;
export const FACTOQUE_PAPEL = GSG_PAPEL;
export const FACTOQUE_COBRE = GSG_COBRE;
export const FACTOQUE_TINTA_OSCURO = GSG_TINTA_OSCURO;
export const FACTOQUE_FONDO_OSCURO = GSG_FONDO_OSCURO;
export const FACTOQUE_COBRE_OSCURO = GSG_COBRE_OSCURO;
export const FACTOQUE_GRIS = "#6B6862"; // design-lint-ignore: gris del «Powered by» de la marca, en un SVG generado
export const FACTOQUE_GRIS_OSCURO = "#9C998F"; // design-lint-ignore: ídem en oscuro

export type GeometriaFactoque = { viewBox: string; forma: string; nudo: string };

/** Isotipo F06-A completo (viewBox 100). */
export const ISOTIPO_FACTOQUE: GeometriaFactoque = {
  viewBox: "0 0 100 100",
  forma: "M15 5h10v90H15zM15 5h70v10H15zM75 5h10v90H75zM33 25h34v10H33zM33 43h34v10H33z",
  nudo: "M45 64h10v10H45z",
};
/** Grilla de 32 (favicon 32, de 24 a 31 px). */
export const ISOTIPO_FACTOQUE_32: GeometriaFactoque = {
  viewBox: "0 0 32 32",
  forma: "M5 2h22v3H5zM5 2h3v28H5zM24 2h3v28h-3zM11 8h10v3H11zM11 14h10v3H11z",
  nudo: "M14 20h4v4h-4z",
};
/** Grilla de 16 (favicon 16, hasta 23 px). */
export const ISOTIPO_FACTOQUE_16: GeometriaFactoque = {
  viewBox: "0 0 16 16",
  forma: "M3 1h10v2H3zM3 1h2v14H3zM11 1h2v14h-2zM6 4h4v2H6z",
  nudo: "M6 9h4v4H6z",
};

/** Logo en curvas: barra (isotipo + «Factoque™», 266×100) y horizontal (+ «Powered by Gestión Studio Grow», 360×100). */
export const LOGO_FACTOQUE = {
  isotipo: "translate(24 14) scale(.72)",
  barra: { viewBox: "0 0 266 100", ancho: 266, alto: 100 },
  horizontal: { viewBox: "0 0 360 100", ancho: 360, alto: 100 },
  nombre:
    "M120.7 59.1H118V40.9h11.2v2.6h-8.4v5.2h7.7v2.5h-7.7zm14.7.4q-1.3 0-2.4-.5-1-.5-1.7-1.4-.7-.9-.7-2.2 0-1.3.7-2.2.6-.9 1.7-1.3 1.1-.4 2.5-.4h4v-.9q0-1-.7-1.8-.7-.6-2.1-.6-1.4 0-2.1.6-.8.7-1 1.7l-2.5-.8q.3-1 1-1.9.7-.8 1.8-1.4 1.2-.5 2.8-.5 2.5 0 4 1.3 1.4 1.3 1.4 3.6v5.3q0 .8.7.8h1V59h-2q-.8 0-1.4-.5-.6-.4-.6-1.2v-.1h-.4l-.6.9q-.4.5-1.2.9-.8.4-2.2.4m.4-2.2q1.6 0 2.6-1 1-.9 1-2.5v-.3h-3.7q-1 0-1.7.5-.7.5-.7 1.3 0 1 .7 1.4.7.5 1.8.5m16 2.2q-1.8 0-3.3-.8-1.5-.8-2.3-2.3-1-1.5-1-3.5v-.4q0-2 1-3.5.8-1.5 2.3-2.3 1.5-.8 3.3-.8 1.9 0 3.2.7 1.3.7 2 1.8.9 1.1 1.1 2.5l-2.6.5q-.1-.9-.5-1.6-.4-.7-1.2-1-.7-.5-1.9-.5-1.1 0-2 .5-1 .5-1.4 1.5-.6 1-.6 2.3v.2q0 1.4.6 2.3.5 1 1.4 1.5.9.5 2 .5 1.7 0 2.6-.9.9-.9 1.1-2.2l2.6.6q-.3 1.3-1.1 2.4-.8 1.1-2.1 1.8-1.3.7-3.2.7M169 59h-3.5q-1.2 0-1.9-.7-.7-.7-.7-1.9v-8h-3.5v-2.2h3.5V42h2.7v4.3h3.8v2.2h-3.8v7.6q0 .7.7.7h2.7zm8.8.4q-1.9 0-3.4-.8-1.5-.8-2.3-2.3-.9-1.5-.9-3.5v-.4q0-2 .9-3.5.8-1.5 2.3-2.3 1.5-.8 3.4-.8 2 0 3.5.8 1.5.8 2.4 2.3.8 1.5.8 3.5v.4q0 2-.8 3.5-1 1.5-2.4 2.3-1.5.8-3.4.8m0-2.4q1.8 0 3-1.2 1-1 1-3v-.3q0-2-1-3.2-1.2-1-3-1-1.7 0-2.8 1-1.1 1.2-1.1 3.2v.2q0 2 1.1 3.1 1.1 1.2 2.8 1.2m22.5 7.2h-2.7v-7h-.4q-.3.6-.8 1l-1.4.9q-.9.3-2.1.3-1.6 0-3-.8-1.3-.8-2.1-2.3-.8-1.4-.8-3.5v-.4q0-2 .8-3.5.8-1.5 2.1-2.3 1.4-.8 3-.8 1.8 0 2.8.7 1 .7 1.6 1.5h.4v-1.8h2.6zm-6.7-7.2q1.8 0 3-1 1-1.2 1-3.3v-.2q0-2-1-3.2-1.2-1.1-3-1.1-1.7 0-2.8 1.1-1.1 1.1-1.1 3.2v.2q0 2 1 3.2 1.2 1.1 3 1.1m15.3 2.2q-1.5 0-2.6-.6-1.1-.7-1.8-1.9-.7-1.2-.7-2.8v-7.7h2.7v7.5q0 1.7.9 2.5.8.8 2.3.8 1.6 0 2.6-1.2 1-1 1-3.1v-6.5h2.7V59h-2.6v-2h-.5q-.3.9-1.2 1.5-1 .7-2.8.7m16.7.2q-2 0-3.4-.9-1.5-.8-2.3-2.3-.8-1.5-.8-3.4v-.4q0-2 .8-3.5.8-1.4 2.2-2.3 1.5-.8 3.4-.8 1.8 0 3.2.8 1.4.9 2.2 2.3.7 1.5.7 3.4v1h-9.8q0 1.7 1.1 2.7 1.1 1 2.7 1 1.5 0 2.3-.6.8-.7 1.2-1.6l2.2 1.1-1 1.6q-.8.8-1.9 1.3-1.1.6-2.8.6m-3.8-8.1h7.1q0-1.5-1-2.3-1-.8-2.5-.8-1.5 0-2.4.8-1 .8-1.2 2.3",
  tm: "M235.5 45.6h-.4v-2.2h.7l.5 1.8.5-1.8h.8v2.2h-.4v-1.9h-.1l-.5 1.9h-.6l-.4-1.9h-.1zm-1.5 0h-.4v-1.9h-.7v-.3h1.9v.3h-.8z",
  respaldo:
    "M118.4 82.4h-1.5v-9.1h3.7q.8 0 1.5.3.6.4 1 1 .4.6.4 1.4v.2q0 .8-.4 1.4-.4.7-1 1-.7.3-1.5.3h-2.2zm0-7.8v3h2q.8 0 1.2-.4.5-.4.5-1V76q0-.7-.5-1-.4-.4-1.2-.4zm9.1 8q-1 0-1.7-.4-.7-.4-1.2-1.2-.4-.7-.4-1.7V79q0-1 .4-1.7.5-.8 1.2-1.2.8-.4 1.7-.4 1 0 1.7.4.8.4 1.2 1.1.4.8.4 1.8v.2q0 1-.4 1.8-.4.7-1.2 1-.7.5-1.7.5m0-1.2q.9 0 1.4-.6.6-.5.6-1.5V79q0-1-.5-1.5-.6-.6-1.5-.6-.8 0-1.4.6-.6.5-.6 1.5v.2q0 1 .6 1.5.6.6 1.4.6m7.8 1H133l-1-6.4h1.3l.8 5.5h.2l1-5.5h2.3l1 5.5h.3l.8-5.5h1.3l-1 6.4h-2.3l-1.1-5.5h-.2zm10 .2q-1 0-1.7-.4-.7-.4-1.1-1.2-.4-.7-.4-1.7V79q0-1 .4-1.7.4-.8 1.1-1.2.7-.4 1.7-.4.9 0 1.6.4.7.4 1 1.2.5.7.5 1.7v.5h-5q0 .8.6 1.3.6.5 1.3.5.8 0 1.2-.3l.6-.8 1 .6q0 .3-.4.7l-1 .7q-.5.3-1.4.3m-1.8-4h3.5q0-.8-.5-1.2-.5-.4-1.2-.4-.8 0-1.3.4-.4.4-.5 1.1m7.7 3.8h-1.3V76h1.3v.8h.2q.1-.5.5-.6.3-.2.8-.2h.8v1.2h-.8q-.7 0-1 .3-.5.4-.5 1.1zm6.3.2q-1 0-1.7-.4-.8-.4-1.2-1.2-.4-.7-.4-1.7V79q0-1 .4-1.7.4-.8 1.1-1.2.8-.4 1.7-.4 1 0 1.6.4.7.4 1.1 1.2.4.7.4 1.7v.5h-5q.1.8.6 1.3.6.5 1.4.5.7 0 1.1-.3l.6-.8 1.1.6-.5.7-1 .7q-.5.3-1.3.3m-2-4h3.6q0-.8-.5-1.2-.4-.4-1.2-.4-.8 0-1.2.4-.5.4-.6 1.1m9.1 4q-.8 0-1.4-.4-.7-.4-1.1-1.1-.4-.8-.4-1.8V79q0-1 .4-1.8.4-.7 1-1.1.7-.4 1.5-.4.7 0 1 .2.5.1.8.4.3.2.4.5h.2v-3.6h1.3v9.1H167v-1h-.2q-.2.5-.7.8-.5.4-1.5.4m.4-1.2q.9 0 1.4-.6.6-.5.6-1.5V79q0-1-.6-1.5-.5-.6-1.4-.6-.8 0-1.4.5-.6.6-.6 1.6v.2q0 1 .6 1.5.6.6 1.4.6m12 1.2q-.9 0-1.4-.4-.5-.3-.7-.7h-.2v.9h-1.3v-9.1h1.3v3.6h.2l.4-.5q.3-.3.7-.4.4-.2 1-.2.9 0 1.6.4.6.4 1 1.1.4.8.4 1.8v.2q0 1-.4 1.8-.4.7-1 1-.7.5-1.5.5m-.3-1.2q.9 0 1.4-.6.6-.5.6-1.5V79q0-1-.6-1.5-.5-.6-1.4-.6-.9 0-1.4.5-.6.6-.6 1.6v.2q0 1 .6 1.5.5.6 1.4.6m9.6 3.6h-4v-1.2h3.6q.3 0 .3-.4v-2h-.2q0 .3-.3.6l-.7.4-1 .1q-.7 0-1.3-.3-.5-.3-.9-1-.3-.5-.3-1.4V76h1.3v3.8q0 .8.5 1.2.4.4 1.1.4.8 0 1.3-.6.5-.5.5-1.6V76h1.4v7.7q0 .6-.4 1-.3.3-1 .3m9.4-2.4q-1 0-1.7-.4-.8-.5-1.2-1.3-.5-.8-.5-2v-2.1q0-1.8 1-2.7 1-1 2.6-1 1.7 0 2.6 1 .9.8.9 2.3H198q0-.6-.3-1-.2-.5-.6-.8-.5-.2-1.2-.2-1 0-1.6.6-.6.6-.6 1.8v2.1q0 1.1.6 1.8.6.6 1.7.6 1 0 1.5-.5.5-.6.5-1.5V79h-2.5V78h3.9v4.5H198v-1h-.2l-.4.6-.7.4q-.4.2-1 .2m8.3 0q-1 0-1.7-.4-.7-.4-1.1-1.2-.4-.7-.4-1.7V79q0-1 .4-1.7.4-.8 1-1.2.8-.4 1.8-.4.9 0 1.6.4.7.4 1 1.2.5.7.5 1.7v.5h-5q0 .8.6 1.3.5.5 1.3.5.8 0 1.2-.3l.6-.8 1 .6-.5.7q-.3.4-.9.7-.5.3-1.4.3m-1.9-4h3.6q0-.8-.5-1.2-.5-.4-1.3-.4-.7 0-1.2.4-.5.4-.6 1.1m9 4q-1.2 0-2-.6-.8-.5-1-1.6l1.3-.3.3.8.7.5.8.1q.6 0 1-.2.3-.3.3-.7 0-.4-.3-.5l-1-.3-.4-.1-1.2-.4q-.6-.2-.9-.6-.3-.4-.3-1 0-.9.7-1.4.7-.5 1.8-.5 1 0 1.8.5.7.5.9 1.3l-1.3.4q-.1-.6-.5-.9-.4-.2-1-.2-.5 0-.8.2-.3.2-.3.6 0 .4.3.5l.8.3h.5l1.3.4q.5.2.9.6.3.4.3 1 0 1-.7 1.5-.7.6-2 .6m8.2-.2h-1.8q-.6 0-1-.4-.3-.3-.3-.9v-4h-1.7V76h1.7v-2.1h1.4v2h1.9v1.2h-2V81q0 .4.4.4h1.4zm3 0h-1.4V76h1.3zm-.7-7.3q-.4 0-.7-.2-.2-.3-.2-.7 0-.4.2-.7.3-.2.7-.2.4 0 .7.3.2.2.2.6 0 .4-.2.7-.3.2-.7.2m5.5 7.5q-1 0-1.7-.4-.7-.4-1.2-1.2-.4-.7-.4-1.7V79q0-1 .4-1.7.5-.8 1.2-1.2.8-.4 1.7-.4 1 0 1.7.4.8.4 1.2 1.1.4.8.4 1.8v.2q0 1-.4 1.8-.4.7-1.2 1-.7.5-1.7.5m0-1.2q.9 0 1.5-.6.5-.5.5-1.5V79q0-1-.5-1.5-.6-.6-1.5-.6-.9 0-1.4.6-.6.5-.6 1.5v.2q0 1 .6 1.5.5.6 1.4.6m.4-6.2h-1.2l1-1.9h1.5zm5.8 7.2H232V76h1.3v1h.2l.6-.8q.5-.3 1.4-.3.8 0 1.3.3.6.3 1 1 .2.5.2 1.3v3.9h-1.3v-3.7q0-.9-.4-1.3-.4-.4-1.2-.4-.8 0-1.3.6-.5.5-.5 1.6zm12.8.2q-1 0-1.8-.4-.8-.4-1.3-1-.4-.8-.4-1.8v-.3h1.4v.3q0 1 .5 1.5.6.4 1.6.4 1 0 1.5-.4.4-.4.4-1 0-.5-.2-.7-.2-.3-.7-.5l-1-.3h-.5l-1.5-.6q-.6-.3-1-.8-.3-.5-.3-1.3 0-.8.4-1.4.4-.6 1-.9.8-.3 1.7-.3 1 0 1.7.3.8.4 1.2 1 .4.6.4 1.6v.5h-1.4V76q0-.6-.2-1-.2-.3-.7-.5-.4-.2-1-.2-.8 0-1.3.4-.4.3-.4 1 0 .4.2.6.2.3.6.5l1 .3h.4l1.6.6q.7.3 1 .8.4.5.4 1.3 0 .9-.4 1.5-.4.6-1.1 1-.8.3-1.8.3m8.9-.2h-1.8q-.6 0-1-.4-.3-.3-.3-.9v-4h-1.7V76h1.7v-2.1h1.4v2h1.9v1.2h-2V81q0 .4.4.4h1.4zm4 .1q-.6 0-1.2-.3-.6-.3-1-1-.2-.5-.2-1.4V76h1.3v3.8q0 .8.4 1.2.4.4 1.2.4.8 0 1.3-.6.5-.5.5-1.6V76h1.3v6.4h-1.3v-1h-.2l-.6.8q-.5.3-1.4.3m8.1 0q-.8 0-1.4-.3-.7-.4-1.1-1.1-.4-.8-.4-1.8V79q0-1 .4-1.8.4-.7 1-1.1.7-.4 1.5-.4.7 0 1 .2.5.1.8.4.3.2.4.5h.2v-3.6h1.3v9.1h-1.3v-1h-.2q-.2.5-.7.8-.5.4-1.5.4m.4-1q.9 0 1.4-.7.6-.5.6-1.5V79q0-1-.5-1.5-.6-.6-1.5-.6-.8 0-1.4.5-.6.6-.6 1.6v.2q0 1 .6 1.5.6.6 1.4.6m6.5.9h-1.3V76h1.3zm-.6-7.3q-.4 0-.7-.2-.3-.3-.3-.7 0-.4.3-.7.3-.2.7-.2.4 0 .6.3.3.2.3.6 0 .4-.3.7-.2.2-.6.2m5.5 7.5q-1 0-1.7-.4-.8-.4-1.2-1.2-.4-.7-.4-1.7V79q0-1 .4-1.7.4-.8 1.2-1.2.7-.4 1.7-.4 1 0 1.7.4.8.4 1.2 1.1.4.8.4 1.8v.2q0 1-.4 1.8-.4.7-1.2 1-.7.5-1.7.5m0-1.2q.9 0 1.4-.6.6-.5.6-1.5V79q0-1-.6-1.5-.5-.6-1.4-.6-.9 0-1.4.6-.6.5-.6 1.5v.2q0 1 .6 1.5.5.6 1.4.6m11.2 1.2q-1 0-1.8-.4-.7-.5-1.2-1.3-.4-.8-.4-2v-2.1q0-1.8 1-2.7 1-1 2.6-1 1.6 0 2.5 1 .9.8.9 2.3h-1.4q0-.6-.2-1-.2-.5-.7-.8-.4-.2-1.1-.2-1 0-1.7.6-.5.6-.5 1.8v2.1q0 1.1.5 1.8.6.6 1.7.6 1 0 1.5-.5.5-.6.5-1.5V79h-2.4V78h3.8v4.5h-1.3v-1h-.2l-.4.6-.6.4q-.4.2-1.1.2m6.6-.2h-1.3V76h1.3v.8h.2q.2-.5.5-.6.4-.2.9-.2h.7v1.2h-.8q-.6 0-1 .3-.5.4-.5 1.1zm6.4.2q-1 0-1.7-.4-.8-.4-1.2-1.2-.4-.7-.4-1.7V79q0-1 .4-1.7.4-.8 1.2-1.2.7-.4 1.7-.4 1 0 1.7.4.7.4 1.2 1.1.4.8.4 1.8v.2q0 1-.4 1.8-.5.7-1.2 1-.8.5-1.7.5m0-1.2q.8 0 1.4-.6.6-.5.6-1.5V79q0-1-.6-1.5-.5-.6-1.4-.6-.9 0-1.5.6-.5.5-.5 1.5v.2q0 1 .5 1.5.6.6 1.5.6m7.7 1h-2.2l-1.1-6.4h1.3l.8 5.5h.2L311 76h2.2l1.1 5.5h.2l.8-5.5h1.4l-1.1 6.4h-2.3l-1-5.5h-.3z",
} as const;

/**
 * Logo como SVG en texto, con colores fijos (para ImageResponse y HTML estático). `respaldo` = la versión
 * horizontal con «Powered by Gestión Studio Grow»; `oscuro` = sobre fondo oscuro.
 */
export function logoFactoqueSvg({ respaldo = false, oscuro = false }: { respaldo?: boolean; oscuro?: boolean } = {}): string {
  const L = LOGO_FACTOQUE;
  const caja = respaldo ? L.horizontal : L.barra;
  const tinta = oscuro ? FACTOQUE_TINTA_OSCURO : FACTOQUE_TINTA;
  const cobre = oscuro ? FACTOQUE_COBRE_OSCURO : FACTOQUE_COBRE;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${caja.viewBox}" width="${caja.ancho}" height="${caja.alto}" role="img" aria-label="Factoque™">` +
    `<g transform="${L.isotipo}"><path fill="${tinta}" d="${ISOTIPO_FACTOQUE.forma}"/><path fill="${cobre}" d="${ISOTIPO_FACTOQUE.nudo}"/></g>` +
    `<path fill="${tinta}" d="${L.nombre}"/><path fill="${cobre}" d="${L.tm}"/>` +
    (respaldo ? `<path fill="${oscuro ? FACTOQUE_GRIS_OSCURO : FACTOQUE_GRIS}" d="${L.respaldo}"/>` : "") +
    `</svg>`
  );
}

/**
 * Ícono de app: el isotipo sobre papel, cuadrado (1024). `zonaSegura` = «maskable» de Android, que recorta hasta un
 * círculo del 80 % del lado: el dibujo va al 50 % del lado. Normal, al 62 %.
 */
export function svgFactoque({ zonaSegura = false }: { zonaSegura?: boolean } = {}): string {
  const caja = zonaSegura ? 512 : 635;
  const o = round((1024 - caja) / 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Factoque"><rect width="1024" height="1024" fill="${FACTOQUE_PAPEL}"/>` +
    `<g transform="translate(${o} ${o}) scale(${round(caja / 100)})"><path fill="${FACTOQUE_TINTA}" d="${ISOTIPO_FACTOQUE.forma}"/><path fill="${FACTOQUE_COBRE}" d="${ISOTIPO_FACTOQUE.nudo}"/></g></svg>`
  );
}

/** Favicon (/facturita/icon.svg): grilla de 32, sin fondo, con los dos temas del sistema. */
export function faviconFactoqueSvg(): string {
  const g = ISOTIPO_FACTOQUE_32;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.viewBox}" width="32" height="32" shape-rendering="crispEdges" role="img" aria-label="Factoque">` +
    `<style>.f{fill:${FACTOQUE_TINTA}}.k{fill:${FACTOQUE_COBRE}}@media (prefers-color-scheme:dark){.f{fill:${FACTOQUE_TINTA_OSCURO}}.k{fill:${FACTOQUE_COBRE_OSCURO}}}</style>` +
    `<path class="f" d="${g.forma}"/><path class="k" d="${g.nudo}"/></svg>`
  );
}

function round(n: number): number {
  return Math.round(n * 100) / 100; // no-es-plata: coordenadas del dibujo del ícono, a dos decimales
}

/** `data:` URI (base64) de un SVG, para usarlo dentro de ImageResponse (Satori lo pinta con resvg). */
export function dataUriSvg(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** `data:` URI del ícono de app. */
export function dataUriFactoque(opciones?: { zonaSegura?: boolean }): string {
  return dataUriSvg(svgFactoque(opciones));
}
