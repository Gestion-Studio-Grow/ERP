// Las letras de A Dos Manos con next/font/google (encargo común 29/10: nada de bajar archivos a mano).
// Next las baja en el build y las sirve desde nuestro dominio. Este módulo lo importa SÓLO la vidriera
// de A Dos Manos (AdosmanosFront.tsx), así que precargan sólo en esa ruta. Nunca en src/app/layout.tsx.
//
// · Archivo (OFL), variable con eje de ANCHO (wdth 62-125): titulares, logotipo y precios. Es la del H1:
//   la única que se precarga.
// · Instrument Sans (OFL), variable de peso: el cuerpo. Sin precarga.
// Ambas son identidad PROVISIONAL a confirmar por el dueño (tokens.ts → MARCA_PROVISIONAL).
// Los respaldos con métricas ajustadas (CLS 0 por letras) los arma next/font solo.

import { Archivo, Instrument_Sans } from "next/font/google";

export const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  preload: true,
  variable: "--am-archivo",
});

export const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
  variable: "--am-instrument",
});

/** Las dos variables, para la raíz `.adm`. */
export const CLASES_DE_FUENTES = `${archivo.variable} ${instrument.variable}`;
