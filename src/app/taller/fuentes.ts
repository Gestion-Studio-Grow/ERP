// LA LETRA DEL TALLER, SÓLO EN /taller/* (encargo de fronts 29/10/2026). next/font/local (archivos en src/fonts/) la sirve
// desde nuestro dominio; precarga una familia sólo en las rutas que importan este módulo (lo importa únicamente
// src/app/taller/layout.tsx). Respaldo con métricas ajustadas automático (adjustFontFallback) → CLS 0 por fuentes.
//
// · Barlow Condensed 700/800 — titulares, la voz de la chapa y del cartel del taller. ÚNICA precargada: es la del H1.
// · Barlow 400/600 — cuerpo y botones.
// · IBM Plex Mono 600 — patente, precios, horarios, números de orden. Arriba del pliegue sólo pinta la patente
//   que escribe la persona (y el placeholder): sin precarga, entra con `swap` sobre su respaldo medido.
import localFont from "next/font/local";

export const barlowCondensed = localFont({
  src: [
    { path: "../../fonts/barlow-condensed/barlow-condensed-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../fonts/barlow-condensed/barlow-condensed-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
  variable: "--agr-f-display",
  display: "swap",
  preload: true,
});

export const barlow = localFont({
  src: [
    { path: "../../fonts/barlow/barlow-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/barlow/barlow-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--agr-f-cuerpo",
  display: "swap",
  preload: false,
});

export const plexMono = localFont({
  src: [
    { path: "../../fonts/ibm-plex-mono/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--agr-f-mono",
  display: "swap",
  preload: false,
});

export const CLASES_FUENTES = `${barlowCondensed.variable} ${barlow.variable} ${plexMono.variable}`;
