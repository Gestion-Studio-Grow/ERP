// La letra de las vidrieras de «Pedí Local» cuya marca la pide (marca.ts → `letra`). Hoy, Manrope
// para Bitácora Café (la de su menú en Fudo; OFL, licencia en src/fonts/manrope/OFL.txt). Va con
// next/font/local como el resto de las letras (guarda D11: el build no depende de Google Fonts) y la
// sirve nuestro dominio. `preload: false`: este módulo viaja con /tienda de TODOS los negocios y sólo
// la usa el que la pide; el @font-face sin uso no descarga nada, y el respaldo con métricas ajustadas
// deja el CLS en 0 mientras llega.

import localFont from "next/font/local";

export const manrope = localFont({
  src: [{ path: "../../../fonts/manrope/manrope-latin-wght-normal.woff2", weight: "200 800", style: "normal" }],
  display: "swap",
  preload: false,
  variable: "--pl-manrope",
});
