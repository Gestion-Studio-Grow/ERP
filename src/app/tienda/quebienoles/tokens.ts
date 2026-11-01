// Los tres tokens que necesitan los componentes de CLIENTE de Qué Bien Olés (el lienzo 3D pinta la pared
// del color de la página y la Q con la didona; las tarjetas usan el oro como acento por defecto).
//
// Viven aparte de estilos.ts a propósito: estilos.ts lleva los ~45 KB de la piel y sólo lo importa el
// componente de SERVIDOR que la escribe en el HTML (QuebienolesVidriera.tsx). Si un componente de cliente
// importara estilos.ts para leer un color, Turbopack arrastraría la piel entera al bundle del navegador
// —que era lo que pasaba— y el visitante la bajaría dos veces: en el HTML y en el JS.

export const FONDO = "#0b0908";
export const ORO = "#d8b36a";
/** La tirita de papel secante donde el vendedor rocía el perfume (rediseño 29/10). Sobre el fondo: 13,9:1. */
export const PAPEL = "#efe6d3";
/** La tirita de un perfume sin stock: el mismo papel, apagado. */
export const PAPEL_APAGADO = "#cfc6b4";
/** La tinta con la que se escribe el nombre en la tirita. */
export const TINTA = "#2a211b";
/** La mesa de mármol negro donde se apoyan frasco y tirita. */
export const MARMOL = "#141110";
/**
 * Un solo `sizes` para TODAS las fotos chicas de frascos (tarjeta, abanico de las puertas, guía, regalo,
 * parecidos): mismo `sizes` y mismo ancho declarado → misma URL del optimizador → la segunda vez sale de
 * la caché. Las fotos originales miden 270-379 px (recortes de Instagram): nunca se muestran más grandes.
 */
export const SIZES_FRASCO = "(max-width: 719px) 46vw, 190px";
/** La familia CSS de la didona, tal como la declara la piel (la usa el lienzo 3D para dibujar la Q). */
export const LETRA_DIDONA = '"QB Bodoni"';
/** Carpeta de las fuentes auto-hospedadas (ADR-099 §Letra). */
export const CARPETA_FUENTES = "/tenants/quebienoles/fuentes";
/** El archivo de la didona regular: el worker del 3D lo carga con FontFace para dibujar la Q. */
export const ARCHIVO_DIDONA = `${CARPETA_FUENTES}/bodoni-moda.woff2`;
