// LETRAS DE LA VIDRIERA GENÉRICA DEL RUBRO (ronda 2, P0 fuentes por superficie). vidriera.module.css las nombra por
// marca (`[data-marca="magra"]` → Bebas/Open Sans, `shinevelas` → Cormorant/Kumbh, deporte → Hanken). Antes salían del
// layout raíz; ahora las declara la vidriera, sin precarga: cada tenant baja sólo las de su marca.
import localFont from "next/font/local";
import { bebas, openSans } from "@/design/fuentes-panel";
import { hanken } from "@/design/fuentes-ch";

const cormorant = localFont({
  src: [
    { path: "../../../fonts/cormorant/cormorant-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../fonts/cormorant/cormorant-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../../fonts/cormorant/cormorant-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-cormorant",
  adjustFontFallback: "Times New Roman",
  display: "swap",
  preload: false,
});

const kumbh = localFont({
  src: [
    { path: "../../../fonts/kumbh-sans/kumbh-sans-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-kumbh",
  display: "swap",
  preload: false,
});

export const FUENTES_VIDRIERA = `${bebas.variable} ${openSans.variable} ${cormorant.variable} ${kumbh.variable} ${hanken.variable}`;
