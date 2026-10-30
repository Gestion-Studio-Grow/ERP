// LA LETRA DEL TALLER, SÓLO EN /taller/* (encargo de fronts 29/10/2026). next/font la baja en el build y la sirve
// desde nuestro dominio; precarga una familia sólo en las rutas que importan este módulo (lo importa únicamente
// src/app/taller/layout.tsx). Respaldo con métricas ajustadas automático (adjustFontFallback) → CLS 0 por fuentes.
//
// · Barlow Condensed 700/800 — titulares, la voz de la chapa y del cartel del taller. ÚNICA precargada: es la del H1.
// · Barlow 400/600 — cuerpo y botones.
// · IBM Plex Mono 600 — patente, precios, horarios, números de orden. Arriba del pliegue sólo pinta la patente
//   que escribe la persona (y el placeholder): sin precarga, entra con `swap` sobre su respaldo medido.
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";

export const barlowCondensed = Barlow_Condensed({
  variable: "--agr-f-display",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  preload: true,
});

export const barlow = Barlow({
  variable: "--agr-f-cuerpo",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
});

export const plexMono = IBM_Plex_Mono({
  variable: "--agr-f-mono",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
  preload: false,
});

export const CLASES_FUENTES = `${barlowCondensed.variable} ${barlow.variable} ${plexMono.variable}`;
