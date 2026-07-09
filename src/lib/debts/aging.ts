// ============================================================================
// AGING de deuda (D2/D3, ADR-060 Fase D/E) — cálculo PURO, compartido AR + AP.
// ============================================================================
//
// "Aging" = qué tan vencida está una deuda respecto de su fecha de vencimiento. Lo usan
// tanto cuentas a COBRAR (fiado del cliente, D3) como a PAGAR (deuda al proveedor, D2):
// el signo del dinero cambia, pero el vencimiento se mide igual. PURO y testeable sin DB.
//
// El SALDO (cuánto falta) sale de `computeSettlement` (src/lib/settlement/collection.ts):
// deuda total − suma de Collections imputadas. Acá solo se clasifica por vencimiento.

/** Estado de una deuda respecto de su vencimiento y su saldo. */
export type AgingStatus =
  | "SETTLED" // saldo 0 → ya no debe nada (gane quien gane la fecha)
  | "NO_DUE_DATE" // deuda abierta sin fecha de vencimiento pactada
  | "NOT_DUE" // por vencer, fuera de la ventana "pronto"
  | "DUE_SOON" // por vencer dentro de la ventana (default 7 días)
  | "OVERDUE"; // vencida (asOf pasó el vencimiento) y con saldo > 0

export interface Aging {
  status: AgingStatus;
  /** Días hasta el vencimiento (≥0) si NOT_DUE/DUE_SOON; null si no aplica. */
  daysUntilDue: number | null;
  /** Días de atraso (≥1) si OVERDUE; null si no aplica. */
  daysOverdue: number | null;
}

/** Ventana "por vencer pronto" por default (días). */
export const DEFAULT_DUE_SOON_DAYS = 7;

/** Días de calendario entre dos fechas (b − a), truncado. Puede ser negativo. PURO. */
export function daysBetween(a: Date, b: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  // Normaliza a medianoche UTC para contar días de calendario, no franjas de 24h exactas.
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((db - da) / MS);
}

/**
 * Clasifica una deuda por vencimiento. PURA. Reglas, en orden:
 * - saldo ≤ 0                → SETTLED (no importa la fecha; no debe nada).
 * - sin `dueDate`            → NO_DUE_DATE (abierta, sin vencimiento pactado).
 * - asOf pasó el vencimiento → OVERDUE (con `daysOverdue`).
 * - vence dentro de la ventana `dueSoonDays` → DUE_SOON.
 * - resto                    → NOT_DUE (`daysUntilDue`).
 */
export function computeAging(
  balance: number,
  dueDate: Date | null | undefined,
  asOf: Date,
  dueSoonDays: number = DEFAULT_DUE_SOON_DAYS,
): Aging {
  if (balance <= 0) return { status: "SETTLED", daysUntilDue: null, daysOverdue: null };
  if (!dueDate) return { status: "NO_DUE_DATE", daysUntilDue: null, daysOverdue: null };

  const diff = daysBetween(asOf, dueDate); // >0 = falta; <0 = venció; 0 = vence hoy
  if (diff < 0) return { status: "OVERDUE", daysUntilDue: null, daysOverdue: -diff };
  if (diff <= dueSoonDays) return { status: "DUE_SOON", daysUntilDue: diff, daysOverdue: null };
  return { status: "NOT_DUE", daysUntilDue: diff, daysOverdue: null };
}

/** Bucket clásico de reporte de aging por días de atraso. */
export type AgingBucket = "CURRENT" | "D1_30" | "D31_60" | "D61_90" | "D90_PLUS";

/**
 * Ubica una deuda en el bucket de aging estándar (para el reporte "cuánto vencido y de
 * cuándo"). CURRENT = no vencida (o saldada). PURA.
 */
export function agingBucket(aging: Aging): AgingBucket {
  if (aging.status !== "OVERDUE" || aging.daysOverdue == null) return "CURRENT";
  const d = aging.daysOverdue;
  if (d <= 30) return "D1_30";
  if (d <= 60) return "D31_60";
  if (d <= 90) return "D61_90";
  return "D90_PLUS";
}
