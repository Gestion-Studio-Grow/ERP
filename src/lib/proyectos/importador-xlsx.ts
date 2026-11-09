// ============================================================================
// PROYECTOS · Etapa 2 · T3 — lectura del libro (.xlsx/.xls) de la planilla de estado, con topes.
// ============================================================================
// Sólo convierte bytes en matrices crudas por pestaña (como src/plugins/bancos/parser/xlsx.ts); la interpretación
// vive en importador-core.ts. Topes: 2 MB, 10 pestañas, 2000 filas por pestaña, textos recortados.
// Antes de parsear, el .xlsx (un zip) se inspecciona a mano (inspeccionarZip): hasta 10 hojas y 15 MB descomprimidos
// en total, inflando de verdad cada entrada con tope (no se confía en el tamaño declarado). `XLSX.read` parsea el libro
// entero antes de cualquier recorte: sin esto, 2 MB comprimidos son cientos de MB de XML y el servidor se cae.

import "server-only";
import { inflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import { esXlsx } from "@/plugins/bancos/parser/xlsx";
import type { Celda, HojaCruda } from "./importador-core";

export const MAX_BYTES_LIBRO = 2 * 1024 * 1024;
export const MAX_PESTANAS = 10;
export const MAX_FILAS = 2000;
const MAX_COLUMNAS = 40;
const MAX_TEXTO_CELDA = 2000;
/** Tope de lo descomprimido sumando todas las entradas del zip. Una planilla real de proyectos ocupa ~1 MB. */
export const MAX_DESCOMPRIMIDO = 15 * 1024 * 1024;
const MAX_ENTRADAS_ZIP = 500;
const MSJ_DANADO = "El archivo parece dañado: no se pudo abrir como planilla. Probá descargarla de nuevo como .xlsx.";
const MSJ_GRANDE = "La planilla tiene demasiados datos para importarla de una vez (más de 15 MB sin comprimir). Dejá sólo las pestañas de proyectos, borrá filas y columnas vacías de más y probá de nuevo.";

/**
 * Recorre el zip igual que lo hace SheetJS (cfb `parse_zip`: fin del directorio central buscado desde el final,
 * cantidad y comienzo del directorio, y el nombre, método y datos del encabezado LOCAL de cada entrada) e infla cada
 * entrada con `maxOutputLength`. Así lo que se mide es exactamente lo que `XLSX.read` va a descomprimir.
 */
export function inspeccionarZip(bytes: Uint8Array): { ok: true } | { ok: false; error: string } {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
  let fin = b.length - 4;
  while (fin >= 0 && !(b[fin] === 0x50 && b[fin + 1] === 0x4b && b[fin + 2] === 0x05 && b[fin + 3] === 0x06)) fin--;
  if (fin < 0 || fin + 20 > b.length) return { ok: false, error: MSJ_DANADO };
  const entradas = b.readUInt16LE(fin + 8);
  if (entradas > MAX_ENTRADAS_ZIP) return { ok: false, error: MSJ_DANADO };
  let p = b.readUInt32LE(fin + 16);
  let hojas = 0;
  let total = 0;
  for (let i = 0; i < entradas; i++) {
    if (p + 46 > b.length) return { ok: false, error: MSJ_DANADO };
    const largoNombre = b.readUInt16LE(p + 28);
    const largoExtra = b.readUInt16LE(p + 30);
    const largoComentario = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (local + 30 > b.length) return { ok: false, error: MSJ_DANADO };
    const metodo = b.readUInt16LE(local + 8);
    const comprimido = b.readUInt32LE(local + 18);
    const nombreLocal = b.readUInt16LE(local + 26);
    const extraLocal = b.readUInt16LE(local + 28);
    const datos = local + 30 + nombreLocal + extraLocal;
    if (datos > b.length) return { ok: false, error: MSJ_DANADO };
    const nombre = b.toString("latin1", local + 30, local + 30 + nombreLocal);
    if (/^\/?xl\/worksheets\/[^/]+\.xml$/i.test(nombre) && ++hojas > MAX_PESTANAS)
      return { ok: false, error: `La planilla tiene más de ${MAX_PESTANAS} pestañas. Dejá sólo las de proyectos (General, Sin asignar y una por productor) y probá de nuevo.` };
    if (metodo === 0) total += Math.min(comprimido, b.length - datos);
    else if (metodo === 8) {
      try {
        total += inflateRawSync(b.subarray(datos), { maxOutputLength: Math.max(1, MAX_DESCOMPRIMIDO - total) }).length;
      } catch (err) {
        return { ok: false, error: (err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE" ? MSJ_GRANDE : MSJ_DANADO };
      }
    } else return { ok: false, error: MSJ_DANADO };
    if (total > MAX_DESCOMPRIMIDO) return { ok: false, error: MSJ_GRANDE };
  }
  return { ok: true };
}

export type LibroLeido = { ok: true; hojas: HojaCruda[]; avisos: string[] } | { ok: false; error: string };

export function leerLibro(bytes: Uint8Array): LibroLeido {
  if (bytes.length === 0) return { ok: false, error: "El archivo está vacío." };
  if (bytes.length > MAX_BYTES_LIBRO) return { ok: false, error: "El archivo pesa más de 2 MB. Dejá sólo las pestañas de proyectos y probá de nuevo." };
  if (!esXlsx(bytes)) return { ok: false, error: "El archivo no es una planilla de Excel (.xlsx). Descargala desde Google Sheets como Microsoft Excel." };
  // El .xls viejo (OLE) no se comprime: con 2 MB ya está acotado. El .xlsx (zip) se inspecciona antes de parsear.
  const esZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (esZip) {
    const zip = inspeccionarZip(bytes);
    if (!zip.ok) return zip;
  }
  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(bytes, { type: "array", cellDates: true, dense: true, sheetRows: MAX_FILAS + 1, sheets: Array.from({ length: MAX_PESTANAS }, (_, i) => i) });
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

/** La celda en modo denso (filas como arreglos; `!data` en versiones nuevas de SheetJS) o por dirección. */
function celdaDe(hoja: XLSX.WorkSheet, r: number, c: number, dir: string): XLSX.CellObject | undefined {
  const denso = Array.isArray(hoja) ? (hoja as unknown as XLSX.CellObject[][]) : (hoja["!data"] as XLSX.CellObject[][] | undefined);
  return denso ? denso[r]?.[c] : (hoja[dir] as XLSX.CellObject | undefined);
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
      const destino = celdaDe(hoja, rango.s.r + i, rango.s.c + j, letras[j] + n)?.l?.Target;
      if (typeof destino === "string" && destino.trim()) links[`${i}:${j}`] = destino.trim().slice(0, MAX_TEXTO_CELDA);
    }
  }
  return links;
}
