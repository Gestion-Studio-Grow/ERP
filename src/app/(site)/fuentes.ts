// LA LETRA DE CH, PRECARGADA SÓLO EN SU SITIO (E3, fuentes por superficie, 29/10/2026). El layout raíz ya no precarga
// Fraunces/Hanken (viajaban a todas las vidrieras); este sitio sí las pinta arriba de todo (el título de la portada),
// así que las pide acá: next/font precarga una familia sólo en las rutas que importan el módulo que la declara. Misma
// configuración que la raíz → mismos archivos: el navegador no baja nada dos veces. Las clases van en la raíz del sitio
// y redefinen ahí las mismas variables (`--font-fraunces`, `--font-hanken`).
import localFont from "next/font/local";

export const frauncesSitio = localFont({
  src: [
    { path: "../../fonts/fraunces/fraunces-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../../fonts/fraunces/fraunces-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-fraunces",
  adjustFontFallback: "Times New Roman",
  display: "swap",
});

export const hankenSitio = localFont({
  src: [
    { path: "../../fonts/hanken-grotesk/hanken-grotesk-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-hanken",
  display: "swap",
});
