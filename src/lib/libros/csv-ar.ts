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
import { textoAlCentavo } from "@/lib/dinero/redondeo";

/** BOM UTF-8. La respuesta HTTP lo antepone al texto. */
export const BOM = "\uFEFF";

/**
 * Un texto que Excel tomaría como FÓRMULA va con un apóstrofo adelante; los números (un
 * importe o un stock en negativo) no se tocan. La regla vive en report-csv.ts y `csvField` ya
 * la aplica en origen; se re-exporta acá porque es donde la buscan los libros.
 */
export { sinFormula };

/**
 * Un campo en UNA línea: los saltos de línea de adentro (un nombre o una nota pegados de un
 * mensaje) pasan a un espacio. Las filas de estos archivos se separan con \r\n; un \n suelto
 * adentro de un campo es CSV válido, pero parte la fila para quien lee línea por línea y
 * mezclaba los dos finales de línea en el mismo archivo. PURA.
 */
export function enUnaLinea(campo: string | number): string | number {
  // Se parte por el salto y se une con un espacio: un campo que EMPIEZA con un salto no puede
  // quedar empezando con un espacio delante de un "=" (`sinFormula` mira el primer carácter).
  if (typeof campo !== "string" || !/[\r\n]/.test(campo)) return campo;
  return campo.split(/\r\n|\r|\n/).map((p) => p.trim()).filter(Boolean).join(" ");
}

/** Una fila: campos en una línea, a salvo de fórmulas, escapados y unidos con `;`. */
export function filaCsv(...campos: (string | number)[]): string {
  return campos.map((c) => csvField(sinFormula(enUnaLinea(c)))).join(";");
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

/**
 * 1234.5 → "1234,50", con la regla única de redondeo (2,135 → "2,14"). Un monto que no es
 * un número no se escribe en un libro fiscal: tira (RangeError), no deja "NaN" en el archivo.
 */
export function pesosCsv(n: number): string {
  return textoAlCentavo(n).replace(".", ",");
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
