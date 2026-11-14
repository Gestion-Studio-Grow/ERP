// La letra de las pantallas públicas del profe (/clases, /mis-clases, /alumno/<token>): Barlow
// Condensed para títulos y Barlow para el cuerpo (OFL, fronts/agendaprofe/DISENO.md §3). Las baja
// Next en el build y las sirve desde nuestro dominio (nada de Google en el navegador del alumno).
// Este módulo lo importa SÓLO la piel del profe (`_piel.tsx`): las fuentes no viajan al layout
// común ni a otras vidrieras. Se precarga sólo la condensada (la del H1, candidato a LCP); el
// respaldo con métricas ajustadas que arma Next sobre Arial deja el CLS en 0 mientras llegan.

import localFont from "next/font/local";

export const barlowCondensada = localFont({
  src: [
    { path: "../../fonts/barlow-condensed/barlow-condensed-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../fonts/barlow-condensed/barlow-condensed-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  display: "swap",
  preload: true,
  variable: "--pz-fuente-display",
});

export const barlow = localFont({
  src: [
    { path: "../../fonts/barlow/barlow-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/barlow/barlow-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  preload: false,
  variable: "--pz-fuente-cuerpo",
});

/** Las dos variables, para el contenedor raíz de la piel. */
export const clasesFuentes = `${barlowCondensada.variable} ${barlow.variable}`;
