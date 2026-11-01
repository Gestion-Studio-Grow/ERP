// LA MARCA DE GSG (Gestión Studio Grow) en SVG, una sola fuente para el HTML estático de la página sin negocio, la
// firma «powered by GSG» del panel y el ícono de la pestaña. El isotipo es el punto «hecho» de las marcas de estado
// (src/components/ui/Marca.tsx) con una hoja que le brota: «Grow». Todo en `currentColor`: el color lo pone quien lo usa.
// Sin fuentes propias: el logotipo hereda la letra del lugar (Geist en el producto).

/** Isotipo solo (36×36): el punto y el brote. */
export const ISOTIPO_GSG_PATHS =
  `<circle cx="14" cy="23" r="11" fill="currentColor"/>` +
  `<path d="M18.5 9.5C18.5 4.6 22.4 1.2 30 1.2C30 7.4 26.4 10.8 18.5 9.5Z" fill="currentColor"/>`;

/** Logo completo (isotipo + «GSG»), 176×40 a tamaño natural. `titulo` va como <title> accesible. */
export function logoGsgSvg({ alto = 32, idTitulo = "gsg-t" }: { alto?: number; idTitulo?: string } = {}): string {
  const ancho = Math.round((alto * 176) / 40);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 40" width="${ancho}" height="${alto}" role="img" aria-labelledby="${idTitulo}">` +
    `<title id="${idTitulo}">GSG — Gestión Studio Grow</title>` +
    `<g>${ISOTIPO_GSG_PATHS}</g>` +
    `<text x="44" y="30" font-family="Geist,var(--font-geist-sans),system-ui,sans-serif" font-size="23" font-weight="650" letter-spacing="-0.7" fill="currentColor">GSG</text>` +
    `</svg>`
  );
}

/** Ícono de la pestaña: el isotipo en papel sobre tinta. data-URI listo para `icons.icon`. */
export function faviconGsgDataUri(): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>` +
    `<rect width='64' height='64' rx='14' fill='#191b1c'/>` +
    `<g transform='translate(12 13) scale(1.1)' color='#f4f5f4'>${ISOTIPO_GSG_PATHS.replace(/"/g, "'")}</g>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
