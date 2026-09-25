// UN SOLO ESPERADO para el cajón (ADR-101).
//
// El efectivo que "debería haber" en el cajón es el saldo en EFECTIVO del libro: la suma con
// signo de todos los movimientos en efectivo del negocio, con la misma aritmética que usa el
// cierre del día (`openingFromHistory`, libro-caja.ts). El turno de cajero y el cierre del día
// leen este número; ninguno arma el suyo aparte.
//
// Antes eran dos: el turno esperaba `fondo tipeado + efectivo del turno` (reconcileCash) y el
// día esperaba `saldo del libro + efectivo del período`. Cuando el fondo tipeado no coincidía
// con el libro, el turno cuadraba y el día asentaba un faltante que nadie tuvo.
//
// Módulo de servidor SIN "use server": recibe `tenantId` por parámetro, así que no puede vivir
// en un archivo que publica sus exports como acciones. Lo llaman `openCashSession`,
// `closeCashSession` y `getCajaData` (caja-actions.ts), dentro de su transacción.

import type { Prisma } from "@/generated/prisma/client";
import { nextDayKey } from "@/lib/caja/cierre-diario";
import { openingFromHistory } from "@/lib/caja/libro-caja";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";
import { businessWallTimeToUtc, dateStrInBusinessTz } from "@/lib/datetime";
import { round2 } from "@/lib/round";

/**
 * Hasta dónde mira el cajón: el final del día del negocio en curso (00:00 del día siguiente,
 * hora de Argentina). Es el MISMO borde que usa el cierre de ese día (`endOfDayUtc`,
 * cierre-diario-actions.ts), así un turno cerrado y el día cerrado en el mismo momento esperan
 * exactamente lo mismo — también con un gasto cargado a las 12:00 antes de las 12:00.
 */
export function finDelDiaDelNegocio(ahora: Date): Date {
  return businessWallTimeToUtc(nextDayKey(dateStrInBusinessTz(ahora)), "00:00");
}

/** Totales por tipo y medio, como los devuelve el `groupBy` del libro. */
export type TotalDelLibro = { type: string; method: string; _sum: { amount: number | null } };

/** Saldo en EFECTIVO a partir de los totales del libro. PURA (misma cuenta que el cierre). */
export function saldoEfectivoDeTotales(totales: readonly TotalDelLibro[]): number {
  const saldo = openingFromHistory(
    totales.map((g, i) => ({
      id: `tot-${i}`,
      occurredAt: new Date(0),
      type: g.type as CashMovementType,
      method: g.method as CashMethod,
      amount: g._sum.amount ?? 0,
      detail: "",
    })),
  );
  return saldo.EFECTIVO;
}

/**
 * El arqueo del turno contra el libro. PURA. `diff` > 0 sobra, < 0 falta. Mismo redondeo que
 * el resto de la plata del sistema.
 */
export function arqueoContraElLibro(saldoDelLibro: number, contado: number): { expected: number; counted: number; diff: number } {
  const expected = round2(saldoDelLibro);
  const counted = round2(contado);
  return { expected, counted, diff: round2(counted - expected) };
}

/**
 * Lee el saldo en efectivo del libro del negocio `tenantId` hasta `hasta` (exclusivo). Un solo
 * `groupBy` que no crece con el histórico, igual que el saldo de arrastre del cierre.
 */
export async function saldoEfectivoDelLibro(tx: Prisma.TransactionClient, tenantId: string, hasta: Date): Promise<number> {
  const totales = await tx.cashMovement.groupBy({
    by: ["type", "method"],
    where: { tenantId, method: "EFECTIVO", occurredAt: { lt: hasta } },
    _sum: { amount: true },
  });
  return saldoEfectivoDeTotales(totales);
}
