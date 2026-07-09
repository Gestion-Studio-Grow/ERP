// ============================================================================
// CONTRATO DE VISTA de Devoluciones a proveedor (D4) — para la UI.
// ============================================================================
//
// La devolución referencia una COMPRA (StockPurchase) y devuelve algunas de sus líneas.
// Al confirmar, el servicio de S1 asienta el movimiento de stock (salida
// DEVOLUCION_PROVEEDOR) + el crédito en la cuenta a pagar del proveedor (D2). Estos tipos
// los llena el loader (hoy stub); cuando S1 publique, se mapean sin cambiar la UI.

/** Una línea de una compra, candidata a devolverse (con lo comprado como tope). */
export interface PurchaseItemOption {
  id: string;
  productId: string | null;
  name: string;
  unit: string;
  /** Cantidad comprada en esa línea = tope de lo devolvible. */
  purchased: number;
  unitCost: number;
}

/** Una compra elegible para devolver (con su proveedor y sus líneas). */
export interface PurchaseOption {
  id: string;
  /** Etiqueta para el selector: proveedor + fecha + código. */
  label: string;
  proveedor: string;
  fecha: Date;
  items: PurchaseItemOption[];
}

/** Una devolución ya registrada (para el historial). */
export interface ReturnHistoryRow {
  id: string;
  fecha: Date;
  proveedor: string;
  motivo: string;
  /** Crédito generado en la cuenta a pagar del proveedor. */
  credito: number;
  /** Resumen corto de lo devuelto (ej. "3 ítems"). */
  detalle: string;
}
