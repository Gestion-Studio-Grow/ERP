// Las letras de Shine con next/font/google (instrucción del coordinador 29/10: reemplaza el auto-hospedaje a
// mano). Next las baja en el build y las sirve desde nuestro dominio; este módulo lo importa SÓLO la
// vidriera de Shine (ShineFront.tsx), así que precargan sólo en esa ruta. Nunca en src/app/layout.tsx.
//
// · Cormorant (sustituto libre de The Seasons, la primaria del manual): 300 para el H1 y el lema, 400 para
//   títulos y nombres, 500 para un énfasis. Es la única que se precarga: es la del H1.
// · Cormorant itálica: sólo la cita del manifiesto, más abajo; sin precarga.
// · Kumbh Sans (la del manual) 400 y 600 para el cuerpo; sin precarga.
// Los respaldos con métricas ajustadas (CLS 0 por letras) los arma next/font solo.

import { Cormorant, Kumbh_Sans } from "next/font/google";

export const cormorant = Cormorant({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal"],
  display: "swap",
  preload: false, // ronda 2: /tienda la comparten 4 marcas; precargada, la bajaban las otras 3
  variable: "--sh-cormorant",
});

export const cormorantItalica = Cormorant({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic"],
  display: "swap",
  preload: false,
  variable: "--sh-cormorant-it",
});

export const kumbh = Kumbh_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
  variable: "--sh-kumbh",
});

/** Las tres variables, para la raíz `.shine`. */
export const CLASES_DE_FUENTES = `${cormorant.variable} ${cormorantItalica.variable} ${kumbh.variable}`;
