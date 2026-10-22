// ============================================================================
// EXPORTAR EL MES DE TODA LA CARTERA — el CSV para el sistema del estudio. PURO.
// ============================================================================
//
// Un archivo con TODOS los comprobantes emitidos del mes por los clientes de la cartera: las
// mismas columnas que la descarga de Facturación de cada negocio (lista-core `CABECERA_CSV` /
// `camposCsv`, con las notas de crédito en negativo), adelante el cliente y su CUIT y al final
// «Qué se facturó» (`Invoice.descripcion`: el abono del mes o el motivo de la nota de crédito). Separador
// `;`, coma decimal y BOM, como los libros (libros/csv-ar.ts).
//
// Nada se calla: si un cliente tenía más comprobantes que el tope, o su lectura falló, la línea
// de aviso va ARRIBA del archivo, con el nombre del cliente.

import { filaCsv } from "@/lib/libros/csv-ar";
import { CABECERA_CSV, camposCsv, type RenglonComprobante } from "@/lib/facturacion/lista-core";

export interface BloqueDeCliente {
  alias: string;
  cuit: string | null;
  /** `null` = no se pudo leer (el aviso lo dice). */
  renglones: RenglonComprobante[] | null;
  recortado: boolean;
  /** `Invoice.descripcion` por id de comprobante (los que la tienen). */
  descripciones?: ReadonlyMap<string, string>;
}

export const CABECERA_CARTERA = ["Cliente", "CUIT del cliente", ...CABECERA_CSV, "Qué se facturó"] as const;

/** Las líneas del CSV (sin BOM ni fin de línea final). PURA. */
export function lineasCsvCartera(bloques: readonly BloqueDeCliente[], tope: number): string[] {
  const avisos: string[] = [];
  for (const b of bloques) {
    if (b.renglones === null) {
      avisos.push(filaCsv(`ATENCIÓN: no se pudieron leer los comprobantes de ${b.alias}. Volvé a bajar el archivo; si sigue, avisale a Soporte GSG.`));
    } else if (b.recortado) {
      avisos.push(filaCsv(`ATENCIÓN: ${b.alias} tiene más de ${tope} comprobantes en el mes y acá van sólo ${tope}. Bajá su paquete del mes por separado.`));
    }
  }
  const filas = bloques.flatMap((b) =>
    (b.renglones ?? []).map((r) => filaCsv(b.alias, b.cuit ?? "", ...camposCsv(r), b.descripciones?.get(r.id) ?? "")),
  );
  return [...avisos, filaCsv(...CABECERA_CARTERA), ...filas];
}

/** «comprobantes-cartera-2026-10.csv». */
export function nombreArchivoCartera(mes: string): string {
  return `comprobantes-cartera-${mes}.csv`;
}
