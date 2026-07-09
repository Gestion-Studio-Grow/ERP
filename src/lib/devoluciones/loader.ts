// ============================================================================
// Loaders de Devoluciones a proveedor (D4) — ⚠️ STUB (dependencia S1).
// ============================================================================
//
// S1 publica el servicio de devolución (asienta stock + crédito en cuentas a pagar) y sus
// loaders (compras elegibles + historial). Hoy devuelven vacío: la pantalla se recorre
// (detrás de flags, perfil Empresa) mostrando su estructura + "en preparación", sin
// dead-end. `TODO(S1)`: cablear cuando estén en el árbol; el contrato de vista ya está fijo.
//
// Guard `catalog:manage` (misma cap que Compras — es una operación de mercadería).

import { requireCapability } from "@/lib/authz";
import type { PurchaseOption, ReturnHistoryRow } from "./types";

/** Compras elegibles para devolver (con sus líneas y lo comprado como tope). */
export async function getReturnablePurchases(): Promise<PurchaseOption[]> {
  await requireCapability("catalog:manage");
  // TODO(S1): compras del tenant con saldo devolvible por línea (comprado − ya devuelto).
  return [];
}

/** Historial de devoluciones ya registradas. */
export async function getReturnsHistory(): Promise<ReturnHistoryRow[]> {
  await requireCapability("catalog:manage");
  // TODO(S1): devoluciones asentadas (movimiento de stock + crédito en cuentas a pagar).
  return [];
}
