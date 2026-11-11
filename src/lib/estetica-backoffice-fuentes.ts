// Las letras propias de la estética de backoffice que no carga el layout raíz. Cada una en este módulo y no en la raíz:
// la descarga sólo el panel del negocio que la usa (`claseDeFuentes`).
import localFont from "next/font/local";
import type { EsteticaBackoffice } from "./estetica-backoffice";

// Break Point «chapa»: Archivo con su eje de ancho (75 % = la angosta de los títulos).
// `preload: false`: sin esto next/font la precarga en todo /admin; así la baja sólo quien la usa.
const archivo = localFont({
  src: "../fonts/archivo/archivo-latin-wdth-normal.woff2",
  weight: "100 900",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
  variable: "--font-archivo",
  display: "swap",
  preload: false,
});

// MIA Producciones: la letra de su sitio.
const workSans = localFont({ src: "../fonts/work-sans/work-sans-latin-wght-normal.woff2", weight: "100 900", variable: "--font-work-sans", display: "swap", preload: false });

/** La clase que define la variable de la letra de esta estética (o "" si usa letras del layout raíz). */
export function claseDeFuentes(estetica: EsteticaBackoffice | null): string {
  if (estetica === "breakpoint") return archivo.variable;
  return estetica === "mia-producciones" ? workSans.variable : "";
}
