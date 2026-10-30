// LA LETRA DE CH, PRECARGADA SÓLO EN SU SITIO (E3, fuentes por superficie, 29/10/2026). El layout raíz ya no precarga
// Fraunces/Hanken (viajaban a todas las vidrieras); este sitio sí las pinta arriba de todo (el título de la portada),
// así que las pide acá: next/font precarga una familia sólo en las rutas que importan el módulo que la declara. Misma
// configuración que la raíz → mismos archivos: el navegador no baja nada dos veces. Las clases van en la raíz del sitio
// y redefinen ahí las mismas variables (`--font-fraunces`, `--font-hanken`).
import { Fraunces, Hanken_Grotesk } from "next/font/google";

export const frauncesSitio = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const hankenSitio = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});
