// ============================================================================
// Cuentas de deuda (a cobrar / a pagar) — cómo se lee el medio de un pago en el historial.
// ============================================================================
//
// Acá vivían los loaders de las listas y las fichas (getReceivables, getReceivable,
// getPayables, getPayable). Las pantallas ya leen con src/lib/debts/cuentas-lectura.ts y nadie
// los llamaba: se borraron en la integración de la ola 3. Queda la regla pura que usan las
// fichas y la devolución a proveedor.

import { NOTA_DE_CREDITO_PREFIX } from "@/lib/stock/supplier-return";

const METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADOPAGO: "Mercado Pago",
};

/**
 * Cómo se lee el medio de un pago a proveedor en el historial. PURA.
 *
 * El crédito que deja una devolución a proveedor contra la deuda se graba como Collection con
 * método TRANSFERENCIA (el enum `PaymentMethod` no tiene "nota de crédito": agregarlo es una
 * migración) y con la nota que empieza con `NOTA_DE_CREDITO_PREFIX` (supplier-return.ts). Sin
 * esto, la dueña veía una "Transferencia" que nunca hizo.
 */
export function medioDelPago(method: string, note: string | null | undefined): string {
  if ((note ?? "").startsWith(NOTA_DE_CREDITO_PREFIX)) return "Nota de crédito por devolución";
  return METHOD_LABEL[method] ?? method;
}
