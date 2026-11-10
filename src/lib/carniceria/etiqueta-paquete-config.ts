// ============================================================================
// Carnicería — CONFIGURACIÓN DE LA ETIQUETA DE PAQUETE (leyenda y alto). PURA.
// ============================================================================
//
// La leyenda de conservación y el alto del papel son por negocio. Se guardan junto a la config
// de la caja (supermercado/config-repo.ts, fila de AuditLog, sin migración) como un campo
// OPCIONAL: lo guardado antes de que existiera se lee con estos valores por defecto.

/** Provisional a confirmar con el dueño (rótulo según el CAA para carne envasada al vacío). */
export const LEYENDA_CONSERVACION = "Conservar refrigerado entre 0 y 4 °C";
/** Ancho fijo del rollo (no se configura todavía). */
export const ANCHO_ETIQUETA_MM = 60;
/** Alto por defecto del papel: provisional a confirmar con la térmica del negocio. */
export const ALTO_ETIQUETA_MM = 50;

export const LEYENDA_MAX = 120;
export const ALTO_MIN_MM = 30;
export const ALTO_MAX_MM = 120;

export type EtiquetaPaqueteConfig = { leyenda: string; altoMm: number };

export const ETIQUETA_PAQUETE_POR_DEFECTO: EtiquetaPaqueteConfig = { leyenda: LEYENDA_CONSERVACION, altoMm: ALTO_ETIQUETA_MM };

export type ValidacionEtiquetaPaquete = { ok: true; valor: EtiquetaPaqueteConfig } | { ok: false; error: string };

/**
 * Valida lo que llega (formulario o fila guardada). La leyenda se recorta de espacios y va de 0
 * a 120 caracteres (vacía = sin leyenda); el alto es un entero de 30 a 120 mm.
 */
export function validarEtiquetaPaquete(entrada: { leyenda: unknown; altoMm: unknown }): ValidacionEtiquetaPaquete {
  if (typeof entrada.leyenda !== "string") return { ok: false, error: "Falta la leyenda (puede quedar vacía)." };
  const leyenda = entrada.leyenda.trim();
  if (leyenda.length > LEYENDA_MAX) return { ok: false, error: `La leyenda tiene más de ${LEYENDA_MAX} letras: acortala.` };
  const alto = typeof entrada.altoMm === "string" ? Number(entrada.altoMm.trim().replace(",", ".")) : entrada.altoMm;
  if (typeof alto !== "number" || !Number.isInteger(alto) || alto < ALTO_MIN_MM || alto > ALTO_MAX_MM) {
    return { ok: false, error: `El alto de la etiqueta va en milímetros enteros, de ${ALTO_MIN_MM} a ${ALTO_MAX_MM}.` };
  }
  return { ok: true, valor: { leyenda, altoMm: alto } };
}

/** La config guardada si es válida; null si no hay o vino rota (se usa la de fábrica). */
export function etiquetaPaqueteDesdeAfuera(x: unknown): EtiquetaPaqueteConfig | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { leyenda?: unknown; altoMm?: unknown };
  if (typeof o.altoMm !== "number") return null;
  const r = validarEtiquetaPaquete({ leyenda: o.leyenda, altoMm: o.altoMm });
  return r.ok ? r.valor : null;
}
