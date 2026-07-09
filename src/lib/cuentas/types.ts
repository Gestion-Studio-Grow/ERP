// ============================================================================
// CONTRATO DE VISTA de las cuentas de deuda (a cobrar / a pagar) — ADR-060 D2/D3.
// ============================================================================
//
// Tipos que consume la UI (listado + detalle). Los LLENA el loader: hoy un stub (las
// tablas `AccountReceivable`/`AccountPayable` son de S1, aún no en el árbol); cuando S1
// publique sus tipos/tablas se mapean a ESTE contrato (fijado por la UI) — la pantalla
// no cambia. El saldo/settlement sale de `computeSettlement` (D9, `@/lib/settlement`).

export type DebtKind = "cobrar" | "pagar";

/** Una cuenta en el listado: contraparte + settlement + vencimiento (para el aging). */
export interface DebtAccountRow {
  id: string;
  /** Cliente (a cobrar) o proveedor (a pagar). */
  contraparte: string;
  /** Total imputado a la cuenta. */
  total: number;
  /** Lo cobrado (a cobrar) o pagado (a pagar) hasta ahora. */
  saldado: number;
  /** Lo que falta: `max(0, total − saldado)`. */
  saldo: number;
  /** Vencimiento del plazo; `null` en fiado light sin plazo (Comercio, ADR-060 D3). */
  vencimiento: Date | null;
  /** Referencia corta (ej. "Fiado mostrador", "OC A-0042"). */
  referencia?: string | null;
}

/** Un cobro/pago parcial ya asentado (vía Collection D9). */
export interface CollectionEntry {
  id: string;
  fecha: Date;
  monto: number;
  metodo: string;
  nota?: string | null;
}

/** Datos de un cheque diferido de una cuenta a pagar (D2, J59). */
export interface PayableChequeInfo {
  numero: string;
  banco: string;
  monto: number;
  /** Fecha en que se puede depositar (el diferimiento). */
  fechaDiferida: Date | null;
  estado: string;
  /** Endosado a un tercero, si corresponde. */
  endosadoA?: string | null;
}

/** Detalle de una cuenta: la fila + su historial de cobros/pagos + (a pagar) sus cheques. */
export interface DebtAccountDetail extends DebtAccountRow {
  historial: CollectionEntry[];
  /** Solo cuentas a pagar (D2): los cheques diferidos asociados. Vacío/ausente si no hay. */
  cheques?: PayableChequeInfo[];
}
