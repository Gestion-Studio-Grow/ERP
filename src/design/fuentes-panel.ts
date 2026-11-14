// LETRAS DE LAS PIELES DEL PANEL (ronda 2, P0 fuentes por superficie). Antes vivían en el layout raíz y cada vidriera
// cargaba sus `@font-face` sin pintarlas. Ahora sólo las declara quien las usa: el panel (`[data-estetica="magra"]`
// → Bebas/Open Sans; theme packs `servicios-spa`/`boutique-carne` → Playfair) y la vidriera genérica del rubro
// (src/app/tienda/vidriera). Sin precarga: se bajan cuando una pantalla las pinta. Mismos nombres de variable que
// antes, así globals.css no cambia.
import localFont from "next/font/local";

// Geist PRECARGADA sólo en el panel. La raíz la declara sin precarga (así las vidrieras, que pintan su propia letra, no
// la bajan); acá la misma familia y las mismas opciones → el mismo archivo, que el panel pide de entrada.
export const geistPanel = localFont({
  src: [
    { path: "../fonts/geist/geist-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-geist-sans",
  preload: true,
});

export const playfair = localFont({
  src: [
    { path: "../fonts/playfair-display/playfair-display-latin-wght-normal.woff2", weight: "400 900", style: "normal" },
  ],
  variable: "--font-spa-serif",
  adjustFontFallback: "Times New Roman",
  display: "swap",
  preload: false,
});

export const bebas = localFont({
  src: [
    { path: "../fonts/bebas-neue/bebas-neue-latin-400-normal.woff2", weight: "400", style: "normal" },
  ],
  variable: "--font-bebas",
  display: "swap",
  preload: false,
});

export const openSans = localFont({
  src: [
    { path: "../fonts/open-sans/open-sans-latin-wght-normal.woff2", weight: "300 800", style: "normal" },
  ],
  variable: "--font-open-sans",
  display: "swap",
  preload: false,
});

/** Las variables de las pieles del panel, para su raíz (`[data-skin="fable"]`). */
export const FUENTES_PANEL = `${geistPanel.variable} ${playfair.variable} ${bebas.variable} ${openSans.variable}`;
