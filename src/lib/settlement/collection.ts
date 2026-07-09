// ============================================================================
// COBRANZA / SETTLEMENT (D9, ADR-060 Fase C.5) — núcleo PURO del cobro parcial.
// ============================================================================
//
// El hueco crítico que marcó la revisión de Opus: hoy servicios cobran con `Payment`
// (1:1) y retail con `Order.paid` (booleano) — NINGUNO soporta COBROS PARCIALES contra
// un saldo, que es justo lo que el fiado necesita. Acá vive la aritmética del saldo:
// dado el total imputado a un origen (Order|Appointment|AccountReceivable) y la lista de
// cobros ya registrados, cuánto falta y en qué estado está. La persistencia (varias filas
// `Collection` por origen) la maneja el repositorio; este módulo es PURO y testeable sin DB.
//
// Dinero: contrato del Core en `number` (ADR-057), redondeo ÚNICO `round2` (cent-safe).
// La persistencia usa `Decimal(14,2)`; la conversión vive en el borde del repositorio.

import { round2 } from "@/lib/round";

/** Origen polimórfico de un cobro (espeja el enum `CollectionOriginType` del schema). */
export type CollectionOriginType = "ORDER" | "APPOINTMENT" | "RECEIVABLE";

/** Estado de settlement de un origen respecto de su total imputado. */
export type SettlementStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";

export interface Settlement {
  /** Total que se debe cobrar por el origen (precio del pedido/turno/deuda). */
  totalCharged: number;
  /** Suma de todos los cobros registrados (parciales + totales), redondeada. */
  collected: number;
  /** Lo que falta cobrar: `max(0, total − collected)`. 0 si está pago o sobre-pago. */
  balance: number;
  /** Excedente cobrado de más: `max(0, collected − total)`. > 0 solo si OVERPAID. */
  overpaid: number;
  status: SettlementStatus;
}

/**
 * Computa el settlement de un origen a partir de su total y sus cobros. PURA.
 * - `UNPAID`   → no se cobró nada (collected == 0 y total > 0).
 * - `PARTIAL`  → se cobró algo pero falta (0 < collected < total).
 * - `PAID`     → collected == total (exacto al centavo).
 * - `OVERPAID` → collected > total (se cobró de más — se expone, no se oculta).
 * Un total 0 con 0 cobros es `PAID` (no hay nada que deber). Montos se redondean a 2.
 */
export function computeSettlement(
  totalCharged: number,
  collectionAmounts: readonly number[],
): Settlement {
  const total = round2(Math.max(0, totalCharged));
  const collected = round2(collectionAmounts.reduce((s, a) => s + a, 0));
  const balance = round2(Math.max(0, total - collected));
  const overpaid = round2(Math.max(0, collected - total));

  let status: SettlementStatus;
  if (collected > total) status = "OVERPAID";
  else if (collected >= total) status = "PAID"; // incluye total 0 / collected 0
  else if (collected <= 0) status = "UNPAID";
  else status = "PARTIAL";

  return { totalCharged: total, collected, balance, overpaid, status };
}

export type CollectionValidationError =
  | "AMOUNT_NOT_POSITIVE" // el cobro debe ser > 0
  | "AMOUNT_NOT_FINITE" // NaN / Infinity
  | "EXCEEDS_BALANCE"; // cobra más que el saldo pendiente (sin permitir sobre-cobro)

export type CollectionValidation =
  | { ok: true; amount: number }
  | { ok: false; error: CollectionValidationError };

/**
 * Valida un NUEVO cobro contra el saldo pendiente. PURA. Guarda estructural del fiado:
 * un cobro parcial nunca puede ser ≤ 0 ni superar lo que falta (sobre-cobro) salvo que
 * el llamador lo permita explícitamente (`allowOverpay`, p. ej. propina/redondeo a favor).
 * Devuelve el monto ya redondeado a 2 para persistir sin arrastre de coma flotante.
 */
export function validateNewCollection(
  amount: number,
  currentBalance: number,
  opts: { allowOverpay?: boolean } = {},
): CollectionValidation {
  if (!Number.isFinite(amount)) return { ok: false, error: "AMOUNT_NOT_FINITE" };
  const amt = round2(amount);
  if (amt <= 0) return { ok: false, error: "AMOUNT_NOT_POSITIVE" };
  if (!opts.allowOverpay && amt > round2(currentBalance)) {
    return { ok: false, error: "EXCEEDS_BALANCE" };
  }
  return { ok: true, amount: amt };
}

/** ¿El origen quedó saldado (nada más que cobrar)? Útil para marcar Order.paid, etc. */
export function isSettled(s: Settlement): boolean {
  return s.status === "PAID" || s.status === "OVERPAID";
}
