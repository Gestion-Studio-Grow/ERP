/**
 * CSV para las planillas de SAP (modo Archivo). Puro y sin dependencias.
 *
 * - Separador `;` por defecto (Excel en castellano lo abre en columnas).
 * - Comillas sólo si el valor tiene el separador, una comilla o un salto de línea; la comilla se duplica.
 * - Arranca con BOM UTF-8 para que Excel lea bien las tildes. Renglones separados con CRLF.
 * - Importes con punto decimal y dos decimales, sin separador de miles ("1234.56").
 */

import type { Centavos } from "../core-contract";

export const BOM = "﻿";

/** Arma el CSV. Sin salto de línea al final (algunos importadores leen un renglón vacío de más). */
export function aCsv(filas: string[][], sep = ";"): string {
  const celda = (v: string) =>
    v.includes(sep) || v.includes('"') || v.includes("\n") || v.includes("\r") ? `"${v.replace(/"/g, '""')}"` : v;
  return BOM + filas.map((fila) => fila.map(celda).join(sep)).join("\r\n");
}

/** Centavos → "1234.56" (punto decimal, dos decimales, sin miles). */
export function importeCsv(c: Centavos): string {
  const entero = Math.round(c);
  const abs = Math.abs(entero);
  return `${entero < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
