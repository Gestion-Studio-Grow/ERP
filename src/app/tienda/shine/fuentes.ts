// Las letras de Shine con next/font/local: los .woff2 viven en src/fonts/ (D11, 10/11: el build ya no depende
// de Google Fonts). Next las sirve desde nuestro dominio; este módulo lo importa SÓLO la
// vidriera de Shine (ShineFront.tsx), así que precargan sólo en esa ruta. Nunca en src/app/layout.tsx.
//
// · Cormorant (sustituto libre de The Seasons, la primaria del manual): 300 para el H1 y el lema, 400 para
//   títulos y nombres, 500 para un énfasis. Es la única que se precarga: es la del H1.
// · Cormorant itálica: sólo la cita del manifiesto, más abajo; sin precarga.
// · Kumbh Sans (la del manual) 400 y 600 para el cuerpo; sin precarga.
// Los respaldos con métricas ajustadas (CLS 0 por letras) los arma next/font solo.

import localFont from "next/font/local";

export const cormorant = localFont({
  src: [
    { path: "../../../fonts/cormorant/cormorant-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../../../fonts/cormorant/cormorant-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../fonts/cormorant/cormorant-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  adjustFontFallback: "Times New Roman",
  display: "swap",
  preload: false, // ronda 2: /tienda la comparten 4 marcas; precargada, la bajaban las otras 3
  variable: "--sh-cormorant",
});

export const cormorantItalica = localFont({
  src: [
    { path: "../../../fonts/cormorant/cormorant-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  adjustFontFallback: "Times New Roman",
  display: "swap",
  preload: false,
  variable: "--sh-cormorant-it",
});

export const kumbh = localFont({
  src: [
    { path: "../../../fonts/kumbh-sans/kumbh-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../fonts/kumbh-sans/kumbh-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--sh-kumbh",
});

/** Las tres variables, para la raíz `.shine`. */
export const CLASES_DE_FUENTES = `${cormorant.variable} ${cormorantItalica.variable} ${kumbh.variable}`;
