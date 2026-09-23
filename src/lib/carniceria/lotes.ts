// ============================================================================
// Carnicería — LOTES / envasado al vacío: lógica pura (FEFO · vencimiento · peso
// variable). Sin DB ni red → testeable. La persistencia (SQL crudo, tolerante a
// schema) vive en lotes-registro.ts y lotes-loader.ts; las tablas se crean con la migración Gate 2
// (prisma/pending-gate2/CarniceriaRubro.sql · tabla ProductBatch).
// ============================================================================
//
// EL VENCIMIENTO ES UN DÍA, NO UN INSTANTE (ola 3). La fecha del formulario ("2026-10-15")
// se guardaba con `new Date("2026-10-15")`, que es la medianoche UTC, y se mostraba en hora
// argentina: 14/10 a las 21:00. El lote se veía vencer UN DÍA ANTES de lo que decía la
// etiqueta, y a la noche "vence hoy" saltaba al día siguiente. Ahora:
//   · se guarda al MEDIODÍA UTC del día (`instanteDelDia`): en cualquier zona entre UTC−12 y
//     UTC+11 sigue siendo el mismo día;
//   · se lee por su fecha UTC (`diaDelLote`), que da el día tipeado tanto para lo nuevo
//     (12:00Z) como para lo guardado antes (00:00Z);
//   · "hoy" es el día del NEGOCIO (`todayInBusinessTz`), no el del servidor.
// Todas las cuentas de días son entre días de calendario ("AAAA-MM-DD"), sin horas.

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
const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** El día de calendario de una fecha de lote ("AAAA-MM-DD"), o null. PURA. */
export function diaDelLote(instante: Date | null | undefined): string | null {
  if (!instante || Number.isNaN(instante.getTime())) return null;
  return instante.toISOString().slice(0, 10);
}

/** El instante con que se guarda un día de calendario: su mediodía UTC. PURA. */
export function instanteDelDia(dia: string): Date {
  return new Date(`${dia}T12:00:00.000Z`);
}

/**
 * Un día que llega del formulario (`<input type="date">`). Vacío → null; un día que no existe
 * (30 de febrero, texto) → "invalido", para frenar con mensaje en vez de guardar otra fecha. PURA.
 */
export function leerDiaDelFormulario(raw: unknown): string | null | "invalido" {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = DIA.exec(s);
  if (!m) return "invalido";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s ? s : "invalido";
}

/** "2026-10-15" → "15/10/2026". PURA. */
export function fmtDia(dia: string): string {
  const m = DIA.exec(dia);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dia;
}

function diasEntre(desde: string, hasta: string): number {
  const a = DIA.exec(desde);
  const b = DIA.exec(hasta);
  if (!a || !b) return NaN;
  const ta = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const tb = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((tb - ta) / MS_DAY);
}

/** Días hasta el vencimiento (negativo si ya venció), contra `hoy` del negocio. null sin fecha. */
export function daysUntil(expiresAt: Date | null, hoy: string): number | null {
  const dia = diaDelLote(expiresAt);
  if (!dia) return null;
  const n = diasEntre(hoy, dia);
  return Number.isFinite(n) ? n : null;
}

export type ExpiryState = "none" | "ok" | "soon" | "expired";

/** Días para "por vencer": la cadena de frío de un vacío. */
export const DIAS_POR_VENCER = 3;

/**
 * Estado de vencimiento para el semáforo: sin fecha → "none"; ya pasó → "expired";
 * vence dentro de `soonDays` → "soon"; si no → "ok". `soonDays` default 3 (cadena de frío).
 */
export function expiryState(expiresAt: Date | null, hoy: string, soonDays = DIAS_POR_VENCER): ExpiryState {
  const d = daysUntil(expiresAt, hoy);
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
 * Devuelve null si no hay ninguno vendible.
 */
export function pickFefo(batches: Batch[], hoy: string): Batch | null {
  const vendibles = sortFefo(
    batches.filter((b) => b.status === "AVAILABLE" && expiryState(b.expiresAt, hoy) !== "expired"),
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

/**
 * Resumen para las KPIs de la pantalla de lotes. Todo cuenta sólo lo DISPONIBLE: un lote
 * agotado o retirado ya no está en la heladera, así que no es un "vencido" que haya que ir a
 * sacar (antes el contador de vencidos sumaba los agotados y nunca bajaba). Puro.
 */
export function summarizeBatches(batches: Batch[], hoy: string): BatchSummary {
  let available = 0,
    expired = 0,
    soon = 0,
    totalKg = 0;
  for (const b of batches) {
    if (b.status !== "AVAILABLE") continue;
    available++;
    totalKg += b.netWeightKg ?? 0;
    const st = expiryState(b.expiresAt, hoy);
    if (st === "expired") expired++;
    else if (st === "soon") soon++;
  }
  return { total: batches.length, available, expired, soon, totalKg: Math.round(totalKg * 1000) / 1000 };
}

/**
 * La plata en riesgo: lotes DISPONIBLES vencidos o que vencen en `dias` días o menos, a su
 * costo por kilo × peso neto. Un lote sin costo o sin peso no se valúa en $0: se cuenta aparte.
 * Puro.
 */
export function plataEnRiesgo(batches: Batch[], hoy: string, dias = DIAS_POR_VENCER): { lotes: number; pesos: number; sinCosto: number } {
  let lotes = 0;
  let pesos = 0;
  let sinCosto = 0;
  for (const b of batches) {
    if (b.status !== "AVAILABLE") continue;
    const st = expiryState(b.expiresAt, hoy, dias);
    if (st !== "expired" && st !== "soon") continue;
    lotes++;
    if (b.unitCost != null && b.unitCost > 0 && b.netWeightKg != null && b.netWeightKg > 0) pesos += b.unitCost * b.netWeightKg;
    else sinCosto++;
  }
  return { lotes, pesos: Math.round(pesos * 100) / 100, sinCosto };
}
