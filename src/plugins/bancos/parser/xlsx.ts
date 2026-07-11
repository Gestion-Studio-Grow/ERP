/**
 * Parser XLSX/XLS de extractos bancarios, sobre SheetJS. Los bancos argentinos
 * entregan tanto `.xlsx` (moderno) como `.xls` (BIFF viejo) — SheetJS lee ambos
 * con la misma API.
 *
 * NOTA de dependencia: se usa la distribución OFICIAL de SheetJS
 * (cdn.sheetjs.com, fijada en package.json); el paquete `xlsx` de npm está
 * abandonado y arrastra CVEs.
 *
 * Igual que el parser CSV, acá NO se interpreta nada: se devuelve la matriz
 * cruda de celdas, preservando el TIPO que declara la celda (fechas como
 * `Date` vía `cellDates`, números como `number`) para que el mapeador tenga
 * la mejor señal posible.
 */

import * as XLSX from "xlsx";

/** Una celda cruda del extracto (CSV entrega solo `string`; XLSX tipa más). */
export type Celda = string | number | boolean | Date | null;

/**
 * Lee un `.xlsx`/`.xls` y devuelve la matriz cruda de la PRIMERA hoja (los
 * extractos vienen en una sola; si el banco agrega hojas decorativas después,
 * el mapeo por hoja se decide en la UI).
 */
export function parsearXlsx(entrada: Uint8Array): Celda[][] {
  const libro = XLSX.read(entrada, {
    type: "array",
    cellDates: true, // fechas como Date, no como serial de Excel
  });
  const nombreHoja = libro.SheetNames[0];
  if (!nombreHoja) return [];
  const hoja = libro.Sheets[nombreHoja];

  // header: 1 → matriz de arrays; raw: true → valores nativos; defval: null →
  // celdas vacías explícitas (mantiene los índices de columna estables).
  const matriz = XLSX.utils.sheet_to_json<Celda[]>(hoja, {
    header: 1,
    raw: true,
    defval: null,
  });

  // Filas totalmente vacías no aportan (renglones decorativos del banco).
  return matriz.filter((fila) => fila.some((c) => c !== null && c !== ""));
}

/**
 * ¿Los bytes son un XLSX/XLS? Sirve para elegir parser cuando la extensión
 * miente (bancos que llaman `.xls` a un HTML o `.csv` a un XLSX).
 *  - XLSX = ZIP → magic `PK\x03\x04`.
 *  - XLS  = OLE compound file → magic `D0 CF 11 E0 A1 B1 1A E1`.
 */
export function esXlsx(bytes: Uint8Array): boolean {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return true;
  }
  const magicOle = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return bytes.length >= 8 && magicOle.every((b, i) => bytes[i] === b);
}
