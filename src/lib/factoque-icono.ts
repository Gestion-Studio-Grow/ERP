/**
 * FACTOQUE · Ícono de marca (carpincho con una factura detrás de la oreja) — fuente ÚNICA.
 *
 * El dueño entregó el SVG fuente el 05/11/2026; los colores son PROVISIONALES a confirmar.
 * De acá salen el favicon SVG y, con next/og (ImageResponse), los PNG de la app instalable y la
 * imagen para compartir: nada binario en Git (norma GSG), todo se genera en el build.
 * Módulo PURO: sin imports, lo pueden usar server components, rutas y tests.
 */

export const FACTOQUE_VERDE = "#1F6F5C"; // design-lint-ignore: color de marca (provisional) en un ícono generado, fuera de CSS
export const FACTOQUE_CREMA = "#FFF8E7"; // design-lint-ignore: ídem
export const FACTOQUE_TRAZO = "#2E2115"; // design-lint-ignore: ídem

/** El dibujo sin fondo, en el lienzo 1024×1024 del SVG fuente. */
const DIBUJO = `<g transform="rotate(28 800 240)"><rect x="745" y="60" width="120" height="280" rx="10" fill="#FFF8E7" stroke="#2E2115" stroke-width="20"/><path d="M772 115h66M772 160h66M772 205h44" stroke="#1F6F5C" stroke-width="16" stroke-linecap="round"/></g><circle cx="306" cy="214" r="38" fill="#C8A46A" stroke="#2E2115" stroke-width="20"/><circle cx="718" cy="214" r="38" fill="#C8A46A" stroke="#2E2115" stroke-width="20"/><rect x="232" y="196" width="560" height="680" rx="130" fill="#C8A46A" stroke="#2E2115" stroke-width="22"/><rect x="270" y="500" width="484" height="340" rx="96" fill="#E8D3A8"/><circle cx="374" cy="392" r="28" fill="#2E2115"/><circle cx="650" cy="392" r="28" fill="#2E2115"/><rect x="334" y="350" width="80" height="42" fill="#C8A46A"/><rect x="610" y="350" width="80" height="42" fill="#C8A46A"/><path d="M340 392h68M616 392h68" stroke="#2E2115" stroke-width="16" stroke-linecap="round"/><ellipse cx="438" cy="596" rx="30" ry="18" fill="#2E2115"/><ellipse cx="586" cy="596" rx="30" ry="18" fill="#2E2115"/><path d="M512 660v48M432 712q80 44 160 0" fill="none" stroke="#2E2115" stroke-width="16" stroke-linecap="round"/>`;

/**
 * SVG del ícono. `zonaSegura` achica el dibujo para el ícono «maskable» de Android, que recorta
 * hasta un círculo del 80 % del lado: el carpincho y la factura tienen que quedar adentro.
 */
export function svgFactoque({ zonaSegura = false }: { zonaSegura?: boolean } = {}): string {
  const escala = zonaSegura ? 0.62 : 0.8;
  // El fuente usa translate(60 110) scale(.8): el dibujo no está centrado en el lienzo (la factura
  // asoma arriba a la derecha). Se conserva ese encuadre y se escala alrededor del centro (512).
  const dx = 512 - escala * ((512 - 60) / 0.8);
  const dy = 512 - escala * ((512 - 110) / 0.8);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Factoque"><rect width="1024" height="1024" fill="${FACTOQUE_VERDE}"/><g transform="translate(${round(dx)} ${round(dy)}) scale(${escala})">${DIBUJO}</g></svg>`;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** `data:` URI para usar el SVG dentro de ImageResponse (Satori lo pinta con resvg). */
export function dataUriFactoque(opciones?: { zonaSegura?: boolean }): string {
  return `data:image/svg+xml;base64,${Buffer.from(svgFactoque(opciones)).toString("base64")}`;
}
