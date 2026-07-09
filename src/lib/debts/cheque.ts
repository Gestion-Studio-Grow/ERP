// ============================================================================
// CHEQUE DIFERIDO (D2, ADR-060 Fase D) — máquina de estados + montos, PURO.
// ============================================================================
//
// El cheque diferido es el instrumento de pago dominante entre pyme y proveedor en AR: se
// entrega hoy un cheque con fecha FUTURA (diferida); recién cuando se acredita mueve plata.
// Acá vive la lógica de estados y de "cuánta plata tengo comprometida en cheques que todavía
// no se acreditaron" — clave para el cash-flow de cuentas a pagar. PURO, testeable sin DB.
//
// Relación con Collection (D9): un cheque que se ACREDITA (CLEARED) es plata efectivamente
// pagada → genera un `Collection` (originType PAYABLE) que baja el saldo de la deuda. Mientras
// está PENDING/DELIVERED es un compromiso, no un pago; si REBOTA (BOUNCED) o se ANULA
// (CANCELED) no pagó nada. Así el saldo de la AP nunca se descuenta por un cheque que no acreditó.

/** Estados del cheque. Espeja el enum `ChequeStatus` del schema. */
export type ChequeStatus =
  | "PENDING" // emitido, en cartera, aún no entregado al proveedor
  | "DELIVERED" // entregado al proveedor, esperando su fecha/acreditación
  | "CLEARED" // acreditado: pagó de verdad → genera Collection
  | "BOUNCED" // rechazado (sin fondos): NO pagó
  | "CANCELED"; // anulado/roto antes de acreditar: NO pagó

/** Estados terminales: no admiten más transiciones. */
export const TERMINAL_CHEQUE_STATES: readonly ChequeStatus[] = ["CLEARED", "BOUNCED", "CANCELED"];

/** Transiciones válidas de la máquina de estados del cheque. */
const CHEQUE_TRANSITIONS: Readonly<Record<ChequeStatus, readonly ChequeStatus[]>> = {
  PENDING: ["DELIVERED", "CANCELED"],
  DELIVERED: ["CLEARED", "BOUNCED", "CANCELED"],
  CLEARED: [],
  BOUNCED: [],
  CANCELED: [],
};

/** ¿Se puede pasar `from → to`? PURA. Un estado terminal no transiciona a nada. */
export function canTransitionCheque(from: ChequeStatus, to: ChequeStatus): boolean {
  return CHEQUE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** ¿El cheque efectivamente PAGÓ (acreditó)? Solo CLEARED mueve plata. PURA. */
export function chequePaid(status: ChequeStatus): boolean {
  return status === "CLEARED";
}

/**
 * ¿El cheque está COMPROMETIDO (entregado o en cartera, aún sin acreditar ni caerse)?
 * Es plata que "va a salir" pero todavía no salió — no baja el saldo, pero sí el cash-flow
 * proyectado. PENDING y DELIVERED cuentan; los terminales no. PURA.
 */
export function chequeCommitted(status: ChequeStatus): boolean {
  return status === "PENDING" || status === "DELIVERED";
}

export interface ChequeAmount {
  status: ChequeStatus;
  amount: number;
}

/** Suma de los cheques COMPROMETIDOS (no acreditados ni caídos). Redondeo cent-safe fuera. PURA. */
export function committedChequeTotal(cheques: readonly ChequeAmount[]): number {
  return cheques.reduce((s, c) => (chequeCommitted(c.status) ? s + c.amount : s), 0);
}

/** Suma de los cheques ACREDITADOS (que efectivamente pagaron). PURA. */
export function clearedChequeTotal(cheques: readonly ChequeAmount[]): number {
  return cheques.reduce((s, c) => (chequePaid(c.status) ? s + c.amount : s), 0);
}
