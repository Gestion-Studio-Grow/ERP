// LA MARCA DE AGUA DE GSG (10/11/2026, orden del dueño): un mosaico de isotipos chicos repetidos en
// filas desplazadas que forman diagonales — un detalle del fondo, no un símbolo grande. SIEMPRE el
// isotipo de GSG, también dentro de un producto («no importa qué producto sea»). Va SÓLO en lo
// que es de GSG (ingreso de un producto, consola del operador, dirección sin negocio, vidrieras de los
// productos, kit, plantillas de documentos de GSG). Nunca en pantallas ni documentos de un negocio
// cliente (CH, MAGRA, Shine, Dos Manos) ni en comprobantes.
//
// Módulo puro: arma el SVG del azulejo (una celda con dos isotipos, el segundo corrido media celda en
// los dos ejes) y su data URI para usarlo como `mask-image` repetida. Con la máscara el color sale del
// tema (`currentColor` sobre un token), así claro y oscuro funcionan sin otro archivo.
import { ISOTIPO_GSG } from "./marca-svg";

/** Celda del mosaico en px: dos isotipos por celda → uno cada `celda/√2` en la diagonal. */
export const CELDA_MOSAICO = 72;
/** Lado del isotipo dentro de la celda, en px. Chico a propósito: es textura, no logo. */
export const LADO_ISOTIPO_MOSAICO = 16;
/** Opacidad por tema (rango pedido: 3–6 %). En oscuro un poco más: la tinta clara se lee menos. */
export const OPACIDAD_MARCA_DE_AGUA = { claro: 0.04, oscuro: 0.06 } as const;

type OpcionesMosaico = { celda?: number; lado?: number };

function ladoDelViewBox(viewBox: string): number {
  const partes = viewBox.trim().split(/\s+/).map(Number);
  return partes[2] > 0 ? partes[2] : 100;
}

/** Los dos isotipos de una celda, como `<g>` con su traslado. `relleno` es el fill de las formas. */
function isotiposDeLaCelda(celda: number, lado: number, relleno: string): string {
  const geo = ISOTIPO_GSG;
  const k = +(lado / ladoDelViewBox(geo.viewBox)).toFixed(4);
  const margen = (celda / 2 - lado) / 2;
  const d = `${geo.forma}${geo.nudo}`;
  const uno = (x: number, y: number) =>
    `<path transform="translate(${x} ${y}) scale(${k})" fill="${relleno}" d="${d}"/>`;
  return uno(margen, margen) + uno(margen + celda / 2, margen + celda / 2);
}

/** El azulejo (una celda) en negro: para usarlo como máscara repetida. */
export function azulejoMosaicoSvg(opciones: OpcionesMosaico = {}): string {
  const celda = opciones.celda ?? CELDA_MOSAICO;
  const lado = opciones.lado ?? LADO_ISOTIPO_MOSAICO;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${celda}" height="${celda}" viewBox="0 0 ${celda} ${celda}">` +
    isotiposDeLaCelda(celda, lado, "#000") +
    `</svg>`
  );
}

/** `url("data:image/svg+xml,…")` del azulejo, listo para `mask-image` o `background-image`. */
export function urlAzulejoMosaico(opciones: OpcionesMosaico = {}): string {
  return `url("data:image/svg+xml,${encodeURIComponent(azulejoMosaicoSvg(opciones))}")`;
}

/**
 * Una hoja entera con el mosaico, hecha con `<pattern>`: la versión del kit (SVG y la fuente del PNG
 * para Docs). Fondo y tinta en hex porque es un archivo suelto, fuera del tema.
 */
export function hojaMosaicoSvg(
  {
    ancho = 1200,
    alto = 800,
    fondo = "#F4F2EC",
    tinta = "#1B1B1B",
    opacidad = OPACIDAD_MARCA_DE_AGUA.claro,
    celda = CELDA_MOSAICO,
    lado = LADO_ISOTIPO_MOSAICO,
  }: OpcionesMosaico & { ancho?: number; alto?: number; fondo?: string; tinta?: string; opacidad?: number } = {},
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">` +
    `<defs><pattern id="gsg-mosaico" width="${celda}" height="${celda}" patternUnits="userSpaceOnUse">` +
    isotiposDeLaCelda(celda, lado, tinta) +
    `</pattern></defs>` +
    `<rect width="100%" height="100%" fill="${fondo}"/>` +
    `<rect width="100%" height="100%" fill="url(#gsg-mosaico)" opacity="${opacidad}"/>` +
    `</svg>`
  );
}
