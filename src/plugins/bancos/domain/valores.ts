/**
 * Valores crudos del extracto → valores del dominio. Utilidades PURAS que
 * comparten los parsers y el mapeador: normalización de texto, números en
 * formato argentino, fechas en los formatos que entregan los bancos y el hash
 * idempotente del movimiento.
 *
 * Sin dependencias del Core (regla de plugin, ADR-022): `redondear2` es la
 * MISMA regla EPSILON-safe de ADR-057 (src/lib/round.ts), copiada acá a
 * propósito porque el plugin no puede importar `src/lib`.
 */

import { createHash } from "node:crypto";

/**
 * Redondeo de dinero a 2 decimales, EPSILON-safe (ADR-057, regla única del
 * sistema): corrige la frontera binaria `x.xx5` (1.005 → 1.01, no 1.00).
 */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Normaliza texto para comparar/matchear: minúsculas, sin acentos, sin signos
 * de puntuación ruidosos, espacios colapsados. Es la base del diccionario de
 * sinónimos del mapeador, del match de templates y del hash idempotente.
 */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca los acentos (combining marks del NFD)
    .toLowerCase()
    .replace(/[$"'()]/g, " ") // símbolos decorativos de headers ("Importe ($)") fuera
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parsea un importe como lo escriben los bancos argentinos. Acepta:
 *   "$ 1.234.567,89" · "1.234,56" · "-1.234,56" · "(1.234,56)" (negativo
 *   contable) · "1234567.89" (formato técnico) · "1,50" · number directo (XLSX).
 * Devuelve pesos con 2 decimales (ADR-057) o null si no es un número.
 */
export function parsearNumeroAR(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? redondear2(v) : null;

  let s = v.replace(/[$\s ]/g, ""); // $, espacios y NBSP fuera
  if (s === "" || s === "-") return null;

  // Negativo contable: "(1.234,56)" → -1234,56.
  let negativo = false;
  const parentesis = /^\((.+)\)$/.exec(s);
  if (parentesis) {
    negativo = true;
    s = parentesis[1];
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  if (!/^[\d.,]+$/.test(s)) return null;

  const tienePunto = s.includes(".");
  const tieneComa = s.includes(",");

  let canonico: string;
  if (tienePunto && tieneComa) {
    // El separador DECIMAL es el que aparece último ("1.234,56" vs "1,234.56").
    canonico =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (tieneComa) {
    // Solo coma: en formato AR es el decimal ("1234,56"). Coma de miles pura
    // ("1,234") es ambigua; la tratamos como decimal solo con 1-2 dígitos al final.
    const m = /^(\d+),(\d{1,2})$/.exec(s);
    canonico = m ? `${m[1]}.${m[2]}` : s.replace(/,/g, "");
  } else if (tienePunto) {
    // Solo punto: "1.234.567" es miles AR; "1234.56" es decimal técnico.
    canonico = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  } else {
    canonico = s;
  }

  const n = Number(canonico);
  if (!Number.isFinite(n)) return null;
  return redondear2(negativo ? -n : n);
}

/** ¿Es una fecha calendario plausible? (no valida bisiestos al detalle; alcanza para detectar columnas). */
function fechaPlausible(anio: number, mes: number, dia: number): boolean {
  return anio >= 1990 && anio <= 2100 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Parsea una fecha como la entregan los bancos y devuelve el formato ARCA
 * `AAAAMMDD` (el mismo que usa todo el camino fiscal: invoice-core, ARCA, MP).
 * Acepta: `Date` (celdas XLSX tipadas), "DD/MM/YYYY", "D/M/YY", "DD-MM-YYYY",
 * "YYYY-MM-DD". Devuelve null si no parsea.
 */
export function parsearFecha(v: string | Date | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getFullYear()}${pad2(v.getMonth() + 1)}${pad2(v.getDate())}`;
  }
  if (typeof v === "number") return null; // un serial suelto de Excel no llega: parseamos con cellDates.

  const s = v.trim();
  if (s === "") return null;

  // ISO: "YYYY-MM-DD" (también "YYYY/MM/DD").
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) {
    const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return fechaPlausible(anio, mes, dia) ? `${anio}${pad2(mes)}${pad2(dia)}` : null;
  }

  // Criollo: "DD/MM/YYYY", "D/M/YY", "DD-MM-YYYY".
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return fechaPlausible(anio, mes, dia) ? `${anio}${pad2(mes)}${pad2(dia)}` : null;
  }

  return null;
}

/**
 * Hash IDEMPOTENTE del movimiento: sha-256 de (fecha, monto a 2 decimales,
 * descripción normalizada). Importar dos veces el mismo extracto (o el mismo
 * movimiento en dos extractos que se solapan) produce el MISMO id → la
 * deduplicación de domain/reglas.ts es determinista (ADR-025 §3, misma idea
 * que el `payment_id` de MP).
 */
export function hashMovimiento(fecha: string, monto: number, descripcion: string): string {
  return createHash("sha256")
    .update(`${fecha}|${monto.toFixed(2)}|${normalizarTexto(descripcion)}`)
    .digest("hex");
}
