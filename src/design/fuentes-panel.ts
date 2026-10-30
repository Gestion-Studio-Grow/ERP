// LETRAS DE LAS PIELES DEL PANEL (ronda 2, P0 fuentes por superficie). Antes vivían en el layout raíz y cada vidriera
// cargaba sus `@font-face` sin pintarlas. Ahora sólo las declara quien las usa: el panel (`[data-estetica="magra"]`
// → Bebas/Open Sans; theme packs `servicios-spa`/`boutique-carne` → Playfair) y la vidriera genérica del rubro
// (src/app/tienda/vidriera). Sin precarga: se bajan cuando una pantalla las pinta. Mismos nombres de variable que
// antes, así globals.css no cambia.
import { Bebas_Neue, Geist, Open_Sans, Playfair_Display } from "next/font/google";

// Geist PRECARGADA sólo en el panel. La raíz la declara sin precarga (así las vidrieras, que pintan su propia letra, no
// la bajan); acá la misma familia y las mismas opciones → el mismo archivo, que el panel pide de entrada.
export const geistPanel = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  preload: true,
});

export const playfair = Playfair_Display({
  variable: "--font-spa-serif",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: false,
});

export const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/** Las variables de las pieles del panel, para su raíz (`[data-skin="fable"]`). */
export const FUENTES_PANEL = `${geistPanel.variable} ${playfair.variable} ${bebas.variable} ${openSans.variable}`;
