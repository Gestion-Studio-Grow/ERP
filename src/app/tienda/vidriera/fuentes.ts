// LETRAS DE LA VIDRIERA GENÉRICA DEL RUBRO (ronda 2, P0 fuentes por superficie). vidriera.module.css las nombra por
// marca (`[data-marca="magra"]` → Bebas/Open Sans, `shinevelas` → Cormorant/Kumbh, deporte → Hanken). Antes salían del
// layout raíz; ahora las declara la vidriera, sin precarga: cada tenant baja sólo las de su marca.
import { Cormorant, Kumbh_Sans } from "next/font/google";
import { bebas, openSans } from "@/design/fuentes-panel";
import { hanken } from "@/design/fuentes-ch";

const cormorant = Cormorant({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

const kumbh = Kumbh_Sans({
  variable: "--font-kumbh",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const FUENTES_VIDRIERA = `${bebas.variable} ${openSans.variable} ${cormorant.variable} ${kumbh.variable} ${hanken.variable}`;
