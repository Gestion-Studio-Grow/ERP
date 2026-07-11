/**
 * Plantillas de extractos conocidos por banco. Si la fila de headers del
 * archivo matchea EXACTO (normalizada) una plantilla, el mapeo sale con
 * confianza 1 sin heurística — costo cero y sin sorpresas.
 *
 * ⚠️ PROVISIONAL A CONFIRMAR: los headers están basados en los formatos
 * públicos/típicos de cada homebanking (no tenemos extractos reales de todos
 * los bancos todavía). Cuando entre un extracto real que no matchee, se ajusta
 * la plantilla y se suma el caso al registro (ADR-047) — el mapeador heurístico
 * cubre el bache mientras tanto.
 *
 * El match es por IGUALDAD EXACTA de la lista de headers normalizados: un
 * template equivocado es peor que caer a la heurística (que igual resuelve),
 * así que preferimos falsos negativos a falsos positivos.
 */

import type { OrigenMovimiento } from "../core-contract";
import { normalizarTexto } from "./valores";

/** Índices de columna (0-based) de cada campo dentro de la fila del extracto. */
export interface ColumnasTemplate {
  fecha: number;
  descripcion: number;
  /** Esquema débito/crédito: dos columnas de importe positivo. */
  debito?: number;
  credito?: number;
  /** Esquema importe único con signo. */
  importe?: number;
  /** El saldo se detecta solo para IGNORARLO (es acumulado, no movimiento). */
  saldo?: number;
  referencia?: number;
  contraparte?: number;
}

export interface TemplateBanco {
  /** Id estable kebab-case (para trazabilidad del mapeo). */
  id: string;
  nombre: string;
  /** Origen del movimiento que produce ("mercadopago" para el export de actividad de MP). */
  origen: OrigenMovimiento;
  /** Headers EXACTOS normalizados (minúsculas, sin acentos), en orden. */
  headers: string[];
  columnas: ColumnasTemplate;
}

export const TEMPLATES: TemplateBanco[] = [
  {
    id: "banco-nacion",
    nombre: "Banco de la Nación Argentina (homebanking)",
    origen: "banco",
    headers: ["fecha", "descripcion", "debito", "credito", "saldo"],
    columnas: { fecha: 0, descripcion: 1, debito: 2, credito: 3, saldo: 4 },
  },
  {
    id: "banco-provincia",
    nombre: "Banco Provincia (BIP)",
    origen: "banco",
    headers: ["fecha", "movimiento", "importe", "saldo"],
    columnas: { fecha: 0, descripcion: 1, importe: 2, saldo: 3 },
  },
  {
    id: "banco-galicia",
    nombre: "Banco Galicia (online banking)",
    origen: "banco",
    headers: ["fecha", "descripcion", "origen", "debitos", "creditos", "saldo"],
    columnas: { fecha: 0, descripcion: 1, referencia: 2, debito: 3, credito: 4, saldo: 5 },
  },
  {
    id: "banco-santander",
    nombre: "Banco Santander (online banking)",
    origen: "banco",
    headers: ["fecha", "descripcion", "referencia", "debito", "credito", "saldo"],
    columnas: { fecha: 0, descripcion: 1, referencia: 2, debito: 3, credito: 4, saldo: 5 },
  },
  {
    id: "banco-bbva",
    nombre: "BBVA Argentina (online banking)",
    origen: "banco",
    headers: ["fecha", "concepto", "fecha valor", "importe", "saldo"],
    columnas: { fecha: 0, descripcion: 1, importe: 3, saldo: 4 },
  },
  {
    id: "banco-macro",
    nombre: "Banco Macro (online banking)",
    origen: "banco",
    headers: ["fecha", "concepto", "referencia", "debito", "credito", "saldo"],
    columnas: { fecha: 0, descripcion: 1, referencia: 2, debito: 3, credito: 4, saldo: 5 },
  },
  {
    id: "mercadopago",
    nombre: "Mercado Pago (export CSV de actividad)",
    origen: "mercadopago",
    headers: ["fecha", "descripcion", "id de la operacion", "contraparte", "monto", "saldo"],
    columnas: { fecha: 0, descripcion: 1, referencia: 2, contraparte: 3, importe: 4, saldo: 5 },
  },
];

/**
 * Busca la plantilla cuya lista de headers coincide EXACTO con la fila dada
 * (ya normalizada con `normalizarTexto`). Null = no hay template, sigue la
 * heurística.
 */
export function buscarTemplate(headersNormalizados: string[]): TemplateBanco | null {
  for (const t of TEMPLATES) {
    if (
      t.headers.length === headersNormalizados.length &&
      t.headers.every((h, i) => h === headersNormalizados[i])
    ) {
      return t;
    }
  }
  return null;
}

/** Normaliza una fila cruda a la forma comparable con `TemplateBanco.headers`. */
export function normalizarHeaders(fila: (string | number | boolean | Date | null)[]): string[] {
  return fila.map((c) => (typeof c === "string" ? normalizarTexto(c) : ""));
}
