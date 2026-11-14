// Las letras de A Dos Manos con next/font/local: los .woff2 viven en src/fonts/ (D11, 10/11: el build ya no
// depende de Google Fonts) y Next los sirve desde nuestro dominio. Este módulo lo importa SÓLO la vidriera
// de A Dos Manos (AdosmanosFront.tsx), así que precargan sólo en esa ruta. Nunca en src/app/layout.tsx.
//
// · Archivo (OFL), variable de PESO: titulares, logotipo y precios. Es la del H1: la única que se precarga.
//   Sin el eje de ancho: con él el archivo latino pesaba 88 KB (medido 29/10) y la regla del diseño (§3)
//   dice que pasando 70 KB va el de sólo peso y lo angosto se logra con `letter-spacing` negativo.
// · Instrument Sans (OFL), variable de peso: el cuerpo. Sin precarga.
// Ambas son identidad PROVISIONAL a confirmar por el dueño (tokens.ts → MARCA_PROVISIONAL).
// Los respaldos con métricas ajustadas (CLS 0 por letras) los arma next/font solo.

import localFont from "next/font/local";

export const archivo = localFont({
  src: [
    { path: "../../../fonts/archivo/archivo-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  preload: false, // ronda 2: /tienda la comparten 4 marcas; precargada, la bajaban las otras 3
  variable: "--am-archivo",
});

export const instrument = localFont({
  src: [
    { path: "../../../fonts/instrument-sans/instrument-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../../fonts/instrument-sans/instrument-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--am-instrument",
});

/** Las dos variables, para la raíz `.adm`. */
export const CLASES_DE_FUENTES = `${archivo.variable} ${instrument.variable}`;
