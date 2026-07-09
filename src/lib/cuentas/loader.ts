// ============================================================================
// Loaders de cuentas de deuda (a cobrar / a pagar) — ⚠️ STUB (dependencia S1).
// ============================================================================
//
// Los loaders REALES los construye S1 (AccountReceivable D3 / AccountPayable D2 +
// Collection D9). Esas tablas NO existen todavía en el schema, así que estos devuelven
// vacío/null: las pantallas se RECORREN (detrás de flags, perfil Empresa) mostrando su
// estructura + un estado "en preparación", SIN dead-end. Punto de cableado marcado
// `TODO(S1)`: cuando sus tipos estén en el árbol, se reemplaza el cuerpo por la consulta
// Prisma + `computeSettlement` — el contrato de vista (`@/lib/cuentas/types`) ya está fijo.
//
// Guard real ya puesto (`billing:manage`, mismo cap que la nav) para el día del vivo.

import { requireCapability } from "@/lib/authz";
import type { DebtAccountRow, DebtAccountDetail } from "./types";

export async function getReceivables(): Promise<DebtAccountRow[]> {
  await requireCapability("billing:manage");
  // TODO(S1): prisma.accountReceivable.findMany + computeSettlement(total, cobros) por cuenta.
  return [];
}

export async function getReceivable(_id: string): Promise<DebtAccountDetail | null> {
  await requireCapability("billing:manage");
  // TODO(S1): cuenta + historial de Collection (originType RECEIVABLE) → DebtAccountDetail.
  return null;
}

export async function getPayables(): Promise<DebtAccountRow[]> {
  await requireCapability("billing:manage");
  // TODO(S1): prisma.accountPayable.findMany + saldo; `referencia` = proveedor/OC.
  return [];
}

export async function getPayable(_id: string): Promise<DebtAccountDetail | null> {
  await requireCapability("billing:manage");
  // TODO(S1): cuenta + PayableCheque (cheque diferido) + historial de egresos → DebtAccountDetail.
  return null;
}
