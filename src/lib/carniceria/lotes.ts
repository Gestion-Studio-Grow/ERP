// ============================================================================
// Carnicería — LOTES / envasado al vacío: lógica pura (FEFO · vencimiento · peso
// variable). Sin DB ni red → testeable. La persistencia (SQL crudo, tolerante a
// schema) vive en lotes-actions.ts; las tablas se crean con la migración Gate 2
// (prisma/pending-gate2/CarniceriaRubro.sql · tabla ProductBatch).
// ============================================================================

export type BatchStatus = "AVAILABLE" | "DEPLETED" | "EXPIRED" | "WITHDRAWN";

export interface Batch {
  id: string;
  code: string;
  productName: string;
  productId: string | null;
  supplierName: string | null;
  packedAt: Date | null;
  expiresAt: Date | null;
  netWeightKg: number | null;
  packages: number;
  unitCost: number | null;
  status: BatchStatus;
}

const MS_DAY = 24 * 60 * 60 * 1000;

/** Días hasta el vencimiento (negativo si ya venció). null si no hay fecha. */
export function daysUntil(expiresAt: Date | null, now: Date): number | null {
  if (!expiresAt) return null;
  // Se compara por día de calendario: piso ambos a medianoche para no depender de la hora.
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth(), expiresAt.getUTCDate());
  return Math.round((b - a) / MS_DAY);
}

export type ExpiryState = "none" | "ok" | "soon" | "expired";

/**
 * Estado de vencimiento para el semáforo: sin fecha → "none"; ya pasó → "expired";
 * vence dentro de `soonDays` → "soon"; si no → "ok". `soonDays` default 3 (cadena de frío).
 */
export function expiryState(expiresAt: Date | null, now: Date, soonDays = 3): ExpiryState {
  const d = daysUntil(expiresAt, now);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= soonDays) return "soon";
  return "ok";
}

/**
 * Peso promedio por paquete (kg) — el corazón del PESO VARIABLE: un vacío no pesa exacto,
 * así que se guarda el peso NETO del lote y su cantidad de paquetes; el promedio = neto /
 * paquetes. null si falta el peso o no hay paquetes. Puro.
 */
export function avgPackageWeight(netWeightKg: number | null, packages: number): number | null {
  if (netWeightKg == null || netWeightKg <= 0) return null;
  if (!packages || packages <= 0) return null;
  return Math.round((netWeightKg / packages) * 1000) / 1000;
}

/**
 * Ordena lotes por FEFO (First-Expired, First-Out): primero el que vence antes. Los sin
 * fecha van al final (no se sabe cuándo vencen → se despachan después de los fechados).
 * NO filtra por estado (el llamador decide); estable. Puro → no muta el array de entrada.
 */
export function sortFefo<T extends { expiresAt: Date | null }>(batches: T[]): T[] {
  return [...batches].sort((x, y) => {
    if (x.expiresAt && y.expiresAt) return x.expiresAt.getTime() - y.expiresAt.getTime();
    if (x.expiresAt) return -1; // fechado antes que sin fecha
    if (y.expiresAt) return 1;
    return 0;
  });
}

/**
 * Próximo lote a despachar de un producto por FEFO: el AVAILABLE no vencido que vence antes.
 * Devuelve null si no hay ninguno vendible. `now` para excluir vencidos.
 */
export function pickFefo(batches: Batch[], now: Date): Batch | null {
  const vendibles = sortFefo(
    batches.filter((b) => b.status === "AVAILABLE" && expiryState(b.expiresAt, now) !== "expired"),
  );
  return vendibles[0] ?? null;
}

export interface BatchSummary {
  total: number;
  available: number;
  expired: number;
  soon: number;
  totalKg: number;
}

/** Resumen para las KPIs de la pantalla de lotes. Puro. */
export function summarizeBatches(batches: Batch[], now: Date): BatchSummary {
  let available = 0,
    expired = 0,
    soon = 0,
    totalKg = 0;
  for (const b of batches) {
    if (b.status === "AVAILABLE") {
      available++;
      totalKg += b.netWeightKg ?? 0;
      const st = expiryState(b.expiresAt, now);
      if (st === "expired") soon += 0; // los vencidos se cuentan aparte
      if (st === "soon") soon++;
    }
    if (expiryState(b.expiresAt, now) === "expired" && b.status !== "WITHDRAWN") expired++;
  }
  return { total: batches.length, available, expired, soon, totalKg: Math.round(totalKg * 1000) / 1000 };
}
