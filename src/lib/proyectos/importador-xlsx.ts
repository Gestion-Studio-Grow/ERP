// ============================================================================
// PROYECTOS · Etapa 2 · T3 — lectura del libro (.xlsx/.xls) de la planilla de estado, con topes.
// ============================================================================
// Sólo convierte bytes en matrices crudas por pestaña (como src/plugins/bancos/parser/xlsx.ts); la interpretación
// vive en importador-core.ts. Topes: 2 MB, 10 pestañas, 2000 filas por pestaña, textos recortados.

import "server-only";
import * as XLSX from "xlsx";
import { esXlsx } from "@/plugins/bancos/parser/xlsx";
import type { Celda, HojaCruda } from "./importador-core";

export const MAX_BYTES_LIBRO = 2 * 1024 * 1024;
export const MAX_PESTANAS = 10;
export const MAX_FILAS = 2000;
const MAX_COLUMNAS = 40;
const MAX_TEXTO_CELDA = 2000;

export type LibroLeido = { ok: true; hojas: HojaCruda[]; avisos: string[] } | { ok: false; error: string };

export function leerLibro(bytes: Uint8Array): LibroLeido {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.length > MAX_BYTES_LIBRO) return { ok: false, error: "El archivo pesa más de 2 MB. Dejá sólo las pestañas de proyectos y probá de nuevo." };
  if (!esXlsx(bytes)) return { ok: false, error: "El archivo no es una planilla de Excel (.xlsx). Descargala desde Google Sheets como Microsoft Excel." };
  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(bytes, { type: "array", cellDates: true, sheetRows: MAX_FILAS + 1 });
  } catch {
    return { ok: false, error: "No se pudo leer la planilla. Probá descargarla de nuevo como .xlsx." };
  }
  const avisos: string[] = [];
  const nombres = libro.SheetNames.slice(0, MAX_PESTANAS);
  if (libro.SheetNames.length > MAX_PESTANAS) avisos.push(`La planilla tiene ${libro.SheetNames.length} pestañas: se leen las primeras ${MAX_PESTANAS}.`);
  const hojas: HojaCruda[] = [];
  for (const nombre of nombres) {
    const hoja = libro.Sheets[nombre];
    if (!hoja) continue;
    if (!hoja["!ref"]) {
      hojas.push({ nombre: String(nombre).slice(0, 80), filas: [] });
      continue;
    }
    // El rango se acota ANTES de leer: una sola celda en XFD1 haría que `defval: null` arme 2000 × 16384 celdas.
    const rango = XLSX.utils.decode_range(hoja["!ref"]);
    rango.e.c = Math.min(rango.e.c, rango.s.c + MAX_COLUMNAS - 1);
    rango.e.r = Math.min(rango.e.r, rango.s.r + MAX_FILAS);
    const matriz = XLSX.utils.sheet_to_json<Celda[]>(hoja, { header: 1, raw: true, defval: null, blankrows: true, range: rango });
    if (matriz.length > MAX_FILAS) avisos.push(`La pestaña «${nombre}» tiene más de ${MAX_FILAS} filas: se leen las primeras.`);
    hojas.push({
      nombre: String(nombre).slice(0, 80),
      filas: matriz.slice(0, MAX_FILAS).map((f) =>
        (f ?? []).slice(0, MAX_COLUMNAS).map((c) => (typeof c === "string" ? c.slice(0, MAX_TEXTO_CELDA) : c instanceof Date || typeof c === "number" || typeof c === "boolean" ? c : null)),
      ),
      links: linksDe(hoja, rango),
    });
  }
  return { ok: true, hojas, avisos };
}

/** Los hipervínculos del rango ya acotado (el chip de Drive de Sheets: texto «Carpeta», URL en `l.Target`). */
function linksDe(hoja: XLSX.WorkSheet, rango: XLSX.Range): Record<string, string> {
  const links: Record<string, string> = {};
  const letras: string[] = [];
  for (let c = rango.s.c; c <= rango.e.c; c++) letras.push(XLSX.utils.encode_col(c));
  const filas = Math.min(rango.e.r - rango.s.r + 1, MAX_FILAS);
  for (let i = 0; i < filas; i++) {
    const n = String(rango.s.r + i + 1);
    for (let j = 0; j < letras.length; j++) {
      const destino = (hoja[letras[j] + n] as XLSX.CellObject | undefined)?.l?.Target;
      if (typeof destino === "string" && destino.trim()) links[`${i}:${j}`] = destino.trim().slice(0, MAX_TEXTO_CELDA);
    }
  }
  return links;
}
