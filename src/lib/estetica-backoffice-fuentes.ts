// Las letras propias de la estética de backoffice que no carga el layout raíz. Cada una en este módulo y no en la raíz:
// la descarga sólo el panel del negocio que la usa (`claseDeFuentes`).
import { Archivo } from "next/font/google";
import type { EsteticaBackoffice } from "./estetica-backoffice";

// Break Point «chapa»: Archivo con su eje de ancho (75 % = la angosta de los títulos).
// `preload: false`: sin esto next/font la precarga en todo /admin; así la baja sólo quien la usa.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap", preload: false });

/** La clase que define la variable de la letra de esta estética (o "" si usa letras del layout raíz). */
export function claseDeFuentes(estetica: EsteticaBackoffice | null): string {
  return estetica === "breakpoint" ? archivo.variable : "";
}
