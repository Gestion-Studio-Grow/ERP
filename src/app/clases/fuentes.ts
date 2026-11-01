// La letra de las pantallas públicas del profe (/clases, /mis-clases, /alumno/<token>): Barlow
// Condensed para títulos y Barlow para el cuerpo (OFL, fronts/agendaprofe/DISENO.md §3). Las baja
// Next en el build y las sirve desde nuestro dominio (nada de Google en el navegador del alumno).
// Este módulo lo importa SÓLO la piel del profe (`_piel.tsx`): las fuentes no viajan al layout
// común ni a otras vidrieras. Se precarga sólo la condensada (la del H1, candidato a LCP); el
// respaldo con métricas ajustadas que arma Next sobre Arial deja el CLS en 0 mientras llegan.

import { Barlow, Barlow_Condensed } from "next/font/google";

export const barlowCondensada = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  preload: true,
  variable: "--pz-fuente-display",
});

export const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
  variable: "--pz-fuente-cuerpo",
});

/** Las dos variables, para el contenedor raíz de la piel. */
export const clasesFuentes = `${barlowCondensada.variable} ${barlow.variable}`;
