// Las letras de MAGRA: Bebas Neue (titulares, la del H1) y Open Sans (cuerpo), las mismas del sitio
// de la marca (OFL). Las baja Next en el build y las sirve desde nuestro dominio: nada de Google en
// el navegador del cliente. Este módulo lo importan SÓLO la vidriera de MAGRA (MagraVidriera.tsx) y
// su página de gracias: no viajan al layout común ni a otras vidrieras. Se precarga sólo Bebas (la
// del H1, candidato a LCP); el respaldo con métricas ajustadas que arma Next deja el CLS en 0.
//
// Ojo en pruebas: `next/font/google` sólo existe compilado por Next. Los tests montan `MagraPiel`
// (sin este módulo) en lugar de `MagraVidriera`.

import { Bebas_Neue, Open_Sans } from "next/font/google";

export const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  preload: true,
  variable: "--mg-f-display",
  fallback: ["Impact", "Arial Narrow", "sans-serif"],
});

// Open Sans es variable: un solo archivo latino (~42 KB) cubre el 400 y el 700. Sin la itálica (otros
// 44 KB sólo para las tres reseñas, debajo del pliegue): las citas van en la oblicua del navegador.
export const openSans = Open_Sans({
  subsets: ["latin"],
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--mg-f-cuerpo",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

/** Las dos variables, para el contenedor raíz de la vidriera. */
export const magraFuentes = `${bebas.variable} ${openSans.variable}`;
