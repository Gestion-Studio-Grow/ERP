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

// ── Cómo se lee un cheque PROPIO en la pantalla ──────────────────────────────
//
// Son cheques que el negocio le da al proveedor. Para la dueña "acreditado" no dice nada: lo
// que le pasa es que el banco se lo DEBITA de su cuenta. Los nombres de la pantalla son los
// de ella; los del enum quedan en la base.

export const ETIQUETA_CHEQUE: Readonly<Record<ChequeStatus, string>> = {
  PENDING: "En la chequera, sin entregar",
  DELIVERED: "Entregado, a debitar",
  CLEARED: "Debitado",
  BOUNCED: "Rebotado",
  CANCELED: "Anulado",
};

/** Un paso que la pantalla ofrece para un cheque, con su botón. */
export interface PasoDeCheque {
  a: ChequeStatus;
  /** El texto del botón. */
  boton: string;
  /**
   * Qué pasa, dicho antes de confirmar. Sólo los pasos sin vuelta atrás lo llevan (debitado,
   * rebotado, anulado): entregar el cheque es de todos los días y no pide confirmación.
   */
  confirmar?: string;
}

/**
 * Los pasos posibles desde un estado, en el orden en que se muestran (el camino feliz
 * primero). Sale de la misma tabla de transiciones que valida el servidor, así la pantalla
 * nunca ofrece un botón que el servidor va a rechazar. PURA.
 */
export function pasosDelCheque(desde: ChequeStatus): PasoDeCheque[] {
  const TEXTOS: Record<ChequeStatus, Omit<PasoDeCheque, "a">> = {
    PENDING: { boton: "En la chequera" },
    DELIVERED: { boton: "Lo entregué" },
    CLEARED: {
      boton: "Se debitó",
      confirmar: "Se registra el pago de la deuda por el monto del cheque y, si las cuentas corrientes están encendidas, el egreso en el libro de caja de hoy.",
    },
    BOUNCED: {
      boton: "Rebotó",
      confirmar: "El cheque queda rebotado y la deuda sigue con el mismo saldo. No se puede deshacer.",
    },
    CANCELED: {
      boton: "Anularlo",
      confirmar: "El cheque queda anulado y la deuda sigue con el mismo saldo. No se puede deshacer.",
    },
  };
  return (CHEQUE_TRANSITIONS[desde] ?? []).map((a) => ({ a, ...TEXTOS[a] }));
}

/** ¿El texto que llegó del formulario es un estado de cheque? Nunca se confía en él. PURA. */
export function esEstadoDeCheque(raw: unknown): raw is ChequeStatus {
  return typeof raw === "string" && Object.prototype.hasOwnProperty.call(CHEQUE_TRANSITIONS, raw);
}
