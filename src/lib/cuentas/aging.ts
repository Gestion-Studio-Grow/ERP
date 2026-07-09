// ============================================================================
// AGING de deuda (cuentas a cobrar / a pagar) — semáforo de estado. PURO.
// ============================================================================
//
// El mapeo estado→color es NEGOCIO de la entidad de deuda (no del DataTable ni del
// Badge): una cuenta VENCIDA es `danger`, POR VENCER es `warning`, AL DÍA es `neutral`
// (canal neutro salvo estos semáforos, ADR-059 D5). El fiado "light" de Comercio puede
// no tener vencimiento (ADR-060 D3) → estado "sin vencimiento", neutral.
//
// Sin dependencias de schema/Prisma: recibe la fecha de vencimiento y una fecha de
// referencia (hoy), devuelve el estado + su tono + los días de mora. Testeable sin DB.

import type { BadgeTone } from "@/components/ui";

export type AgingState = "al-dia" | "por-vencer" | "vencida" | "sin-vencimiento";

export interface Aging {
  state: AgingState;
  /** Etiqueta en criollo para el Badge ("Vencida", "Por vencer", "Al día", "Sin vencimiento"). */
  label: string;
  /** Semáforo de estado (la única excepción al canal neutro, ADR-059 D5). */
  tone: BadgeTone;
  /** Días de mora si está vencida (> 0); `null` si no aplica. */
  diasVencida: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días de calendario entre dos fechas (b − a), truncando la hora (UTC). PURA. */
function daysBetween(a: Date, b: Date): number {
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((db - da) / DAY_MS);
}

/**
 * Estado de aging de una cuenta según su vencimiento y la fecha de referencia (hoy). PURA.
 * - `sin vencimiento` (venc == null) → neutral (fiado light sin plazo, ADR-060 D3).
 * - `vencida`  (venc < hoy) → danger, con días de mora.
 * - `por vencer` (0 ≤ díasRestantes ≤ `porVencerDias`, default 7) → warning.
 * - `al día` (falta más que el umbral) → neutral.
 */
export function agingOf(
  vencimiento: Date | null | undefined,
  ref: Date,
  opts: { porVencerDias?: number } = {},
): Aging {
  if (vencimiento == null) {
    return { state: "sin-vencimiento", label: "Sin vencimiento", tone: "neutral", diasVencida: null };
  }
  const porVencerDias = opts.porVencerDias ?? 7;
  const diasRestantes = daysBetween(ref, vencimiento); // > 0 = falta; < 0 = vencida

  if (diasRestantes < 0) {
    const dias = -diasRestantes;
    return { state: "vencida", label: `Vencida (${dias} ${dias === 1 ? "día" : "días"})`, tone: "danger", diasVencida: dias };
  }
  if (diasRestantes <= porVencerDias) {
    return {
      state: "por-vencer",
      label: diasRestantes === 0 ? "Vence hoy" : `Por vencer (${diasRestantes} ${diasRestantes === 1 ? "día" : "días"})`,
      tone: "warning",
      diasVencida: null,
    };
  }
  return { state: "al-dia", label: "Al día", tone: "neutral", diasVencida: null };
}

/** Resumen de aging sobre una lista de saldos con su vencimiento — para los KPIs de la pantalla. */
export interface AgingResumen {
  total: number;
  vencido: number;
  porVencer: number;
  alDia: number;
  cuentas: number;
}

/** Suma saldos por estado de aging. PURA. `round` la aporta el llamador (server) para no acoplar. */
export function summarizeAging(
  items: readonly { saldo: number; vencimiento: Date | null }[],
  ref: Date,
  opts: { porVencerDias?: number } = {},
): AgingResumen {
  let total = 0, vencido = 0, porVencer = 0, alDia = 0;
  for (const it of items) {
    total += it.saldo;
    const a = agingOf(it.vencimiento, ref, opts);
    if (a.state === "vencida") vencido += it.saldo;
    else if (a.state === "por-vencer") porVencer += it.saldo;
    else alDia += it.saldo;
  }
  return { total, vencido, porVencer, alDia, cuentas: items.length };
}
