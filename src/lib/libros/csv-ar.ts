// ============================================================================
// CSV para la contadora — el formato que Excel en castellano abre bien. PURO.
// ============================================================================
//
// Separador `;` porque en es-AR la coma es el separador decimal y Excel en ese idioma parte
// los números con `,`. Importes con COMA decimal y sin separador de miles: es lo que Excel
// es-AR lee como número (con punto quedan como texto y no se pueden sumar, que es lo primero
// que hace quien recibe el archivo). Y el BOM UTF-8 adelante, para que Excel en Windows no
// rompa los acentos. Mismo criterio que el libro de caja (caja/libro-csv.ts) y Reportes.

import { csvField, sinFormula } from "@/lib/report-csv";

/** BOM UTF-8. La respuesta HTTP lo antepone al texto. */
export const BOM = "\uFEFF";

/**
 * Un texto que Excel tomaría como FÓRMULA va con un apóstrofo adelante; los números (un
 * importe o un stock en negativo) no se tocan. La regla vive en report-csv.ts y `csvField` ya
 * la aplica en origen; se re-exporta acá porque es donde la buscan los libros.
 */
export { sinFormula };

/** Una fila: campos a salvo de fórmulas, escapados y unidos con `;`. */
export function filaCsv(...campos: (string | number)[]): string {
  return campos.map((c) => csvField(sinFormula(c))).join(";");
}

/**
 * Los campos de UNA línea ya armada con `;` y comillas (RFC 4180). Sirve para pasar por
 * `filaCsv` líneas que arma otro módulo (el libro de caja) y que no neutralizan fórmulas.
 * Una comilla que no cierra toma el resto de la línea. PURA.
 */
export function camposDeLineaCsv(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;
  let alInicio = true;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (entreComillas) {
      if (ch === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (ch === '"') {
        entreComillas = false;
      } else {
        actual += ch;
      }
    } else if (ch === '"' && alInicio) {
      entreComillas = true;
      alInicio = false;
    } else if (ch === ";") {
      campos.push(actual);
      actual = "";
      alInicio = true;
    } else {
      actual += ch;
      alInicio = false;
    }
  }
  campos.push(actual);
  return campos;
}

/** Una línea ajena, vuelta a armar con `filaCsv` (a salvo de fórmulas). Vacía queda vacía. PURA. */
export function lineaSinFormulas(linea: string): string {
  return linea === "" ? "" : filaCsv(...camposDeLineaCsv(linea));
}

/** 1234.5 → "1234,50". */
export function pesosCsv(n: number): string {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2).replace(".", ",");
}

/** 0.105 → "10,5%". */
export function alicuotaCsv(frac: number): string {
  return `${(frac * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

/** Las cabeceras de una descarga CSV, con el nombre de archivo que ve la persona. */
export function cabecerasCsv(nombreArchivo: string): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${nombreArchivo.replace(/[^\w.-]/g, "_")}"`,
    "Cache-Control": "no-store",
  };
}
