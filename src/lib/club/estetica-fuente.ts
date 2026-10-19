// La letra de la estética «chapa» de Break Point: Archivo con su eje de ancho (75 % = la angosta de los títulos).
// Va en su propio módulo y no en el layout raíz: sólo la descarga el panel del club que la usa.
import { Archivo } from "next/font/google";

export const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});
