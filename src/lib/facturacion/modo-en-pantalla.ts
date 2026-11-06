// ============================================================================
// EL MODO DE ARCA QUE MUESTRA LA PANTALLA — PURO
// ============================================================================
//
// La pantalla de Facturación lee el modo DE ESTE NEGOCIO (`resolverModoDelNegocio`). Si el negocio
// no puede facturar (marcado real sin la segunda llave, sin certificado de producción, plataforma
// en pruebas…) o el modo no se pudo leer, NO se cae al modo global de la plataforma: eso mostraba
// «ARCA en producción» en un negocio que no emite nada. Falla cerrada: se muestra que no factura y
// por qué, y el modo queda en «stub» (nunca «real») para que todo lo que dependa de él avise.

import type { ResultadoDelModo } from "@/lib/fiscal/modo-del-negocio";

export interface ModoEnPantalla {
  modo: "stub" | "homologacion" | "real";
  /** null = factura normal; si no, el motivo en criollo de por qué este negocio no factura. */
  noFactura: string | null;
}

export const NO_SE_PUDO_LEER_EL_MODO =
  "No se pudo leer cómo factura este negocio ante ARCA, así que por las dudas no se emite nada. " +
  "Probá de nuevo en un rato; si sigue igual, avisale a Gestión Studio Grow.";

export function modoEnPantalla(resultado: ResultadoDelModo | null): ModoEnPantalla {
  if (resultado && "modo" in resultado) return { modo: resultado.modo, noFactura: null };
  return { modo: "stub", noFactura: resultado?.error ?? NO_SE_PUDO_LEER_EL_MODO };
}
