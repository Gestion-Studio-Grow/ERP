// FRAUNCES + HANKEN fuera de las vidrieras (ronda 2, P0 fuentes por superficie). Es la letra del panel (títulos `.font-display`
// y cuerpo de la piel «fable») y la de Facturita (src/app/facturita/piel.ts usa `--font-fraunces`/`--font-hanken`).
// Sin precarga: el navegador baja cada archivo sólo cuando una pantalla lo pinta. CH tiene SU declaración precargada
// en src/app/(site)/fuentes.ts.
//
// Hoy la importa el layout raíz SÓLO por Facturita (otra sesión la está moviendo a src/app/facturin: no se toca esa
// carpeta desde esta rama). Pedido cruzado: que el layout de facturin ponga `FUENTES_CH` en su raíz; con eso, este
// import sale del layout raíz y la raíz queda sólo con Geist.
import localFont from "next/font/local";

export const fraunces = localFont({
  src: [
    { path: "../fonts/fraunces/fraunces-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/fraunces/fraunces-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-fraunces",
  adjustFontFallback: "Times New Roman",
  display: "swap",
  preload: false,
});

export const hanken = localFont({
  src: [
    { path: "../fonts/hanken-grotesk/hanken-grotesk-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-hanken",
  display: "swap",
  preload: false,
});

/** Las dos variables, para la raíz de una superficie que las pinte. */
export const FUENTES_CH = `${fraunces.variable} ${hanken.variable}`;
