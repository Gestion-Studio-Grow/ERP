// Las letras de MAGRA: Bebas Neue (titulares, la del H1) y Open Sans (cuerpo), las mismas del sitio
// de la marca (OFL). Viven en src/fonts/ (next/font/local, D11) y Next las sirve desde nuestro dominio: nada de Google en
// el navegador del cliente. Este módulo lo importan SÓLO la vidriera de MAGRA (MagraVidriera.tsx) y
// su página de gracias: no viajan al layout común ni a otras vidrieras. Se precarga sólo Bebas (la
// del H1, candidato a LCP); el respaldo con métricas ajustadas que arma Next deja el CLS en 0.
//
// Ojo en pruebas: `next/font/local` sólo existe compilado por Next. Los tests montan `MagraPiel`
// (sin este módulo) en lugar de `MagraVidriera`.

import localFont from "next/font/local";

export const bebas = localFont({
  src: [
    { path: "../../../fonts/bebas-neue/bebas-neue-latin-400-normal.woff2", weight: "400", style: "normal" },
  ],
  display: "swap",
  preload: false, // ronda 2: /tienda la comparten 4 marcas; precargada, la bajaban las otras 3
  variable: "--mg-f-display",
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

// Open Sans es variable: un solo archivo latino (~42 KB) cubre el 400 y el 700. Sin la itálica (otros
// 44 KB sólo para las tres reseñas, debajo del pliegue): las citas van en la oblicua del navegador.
export const openSans = localFont({
  src: [
    { path: "../../../fonts/open-sans/open-sans-latin-wght-normal.woff2", weight: "300 800", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--mg-f-cuerpo",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

/** Las dos variables, para el contenedor raíz de la vidriera. */
export const magraFuentes = `${bebas.variable} ${openSans.variable}`;
