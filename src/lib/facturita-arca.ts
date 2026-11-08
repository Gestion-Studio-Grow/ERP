/**
 * FACTOQUE · Tarjeta «Conectar con ARCA» de Mi cuenta (Plan de salida 11/2026 §1 #6 y #7b).
 * PURA: traduce la ficha fiscal del pase (`leerFichaDelPase`) al estado que ve el cliente, con
 * el mismo criterio que el despacho (`modoDelNegocio`). El detalle técnico del operador (variables,
 * `ARCA_REAL_TENANTS`) no se muestra: el cliente ve qué le falta y adónde ir.
 */

import { modoDelNegocio } from "@/lib/fiscal/modo-del-negocio";
import type { FichaFiscalDelPase } from "@/lib/operador/pase-a-real";

export type TonoArca = "success" | "warning" | "neutral";

export interface EstadoConexionArca {
  etiqueta: string;
  detalle: string;
  tono: TonoArca;
  /** Texto del botón que lleva al asistente de 4 pasos. */
  accion: string;
}

export function estadoConexionArca(ficha: FichaFiscalDelPase | null): EstadoConexionArca {
  if (!ficha) {
    return {
      etiqueta: "Sin datos",
      detalle: "No pudimos leer el estado de tu conexión con ARCA. Probá de nuevo en unos minutos.",
      tono: "neutral",
      accion: "Ir a la conexión con ARCA",
    };
  }
  const r = modoDelNegocio({
    techo: ficha.modoArca,
    arcaHomologacion: ficha.arcaHomologacion,
    slug: ficha.slug,
    habilitadosReal: ficha.enListaReal ? [ficha.slug] : [],
    credencial: ficha.credencial ? { entorno: ficha.credencial.entorno } : null,
  });
  if ("error" in r) {
    return {
      etiqueta: "Falta terminar",
      detalle:
        "Pediste facturar en real y falta un paso (tu certificado de producción o que habilitemos el pase). " +
        "Mientras tanto, las facturas quedan pendientes y salen apenas esté todo.",
      tono: "warning",
      accion: "Ver qué falta",
    };
  }
  if (r.modo === "real") {
    return {
      etiqueta: "Conectada",
      detalle: "Facturás en real, a tu nombre y con tu certificado. Cada factura sale con su CAE de ARCA.",
      tono: "success",
      accion: "Ver la conexión",
    };
  }
  if (r.modo === "homologacion") {
    return {
      etiqueta: "En pruebas",
      detalle: "Tu certificado está cargado y probás contra ARCA. Estas facturas no tienen validez fiscal: cuando quieras, pedí el pase a real.",
      tono: "warning",
      accion: "Seguir con la conexión",
    };
  }
  return {
    etiqueta: "Sin conectar",
    detalle: ficha.credencial
      ? "Todavía facturás en modo simulado, sin validez fiscal. Terminá la conexión para emitir de verdad."
      : "Para emitir a tu nombre, cargá tu propio certificado de ARCA: lo sacás vos con tu clave fiscal, en 4 pasos que te guiamos. Nunca te pedimos tu clave fiscal. Si necesitás ayuda, encontrás a los contadores que usan nuestro sistema.",
    tono: "warning",
    accion: "Conectar con ARCA",
  };
}
