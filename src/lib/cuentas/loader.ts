// ============================================================================
// Loaders de cuentas de deuda (a cobrar / a pagar) — cableado a los datos reales de S1.
// ============================================================================
//
// Mapea los loaders de S1 (`@/lib/debts/*-repo`, sobre `AccountReceivable`/`AccountPayable`
// + `Collection`) al CONTRATO DE VISTA de la UI (`./types`) — así las pantallas no cambian
// aunque cambie el backend. El saldo y el settlement los computa S1 (fuente de verdad
// única: `amount − Σ Collection`); acá solo se re-nombra a `contraparte/total/saldado/saldo`.
//
// El aging (semáforo) lo computa la PANTALLA con `@/lib/cuentas/aging` sobre `vencimiento`
// — es negocio de la entidad y se mantiene del lado de la UI (ADR-059 D5).
//
// Guard `billing:manage` + tenant scoping (S1 recibe el tenantId). ⚠️ Las tablas viven tras
// las migraciones D2/D3 (§C · Gate 2, sin aplicar a prod) — el código es correcto; correrlo
// contra datos reales requiere esa migración.

import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { listReceivables, getReceivableDetail } from "@/lib/debts/receivable-repo";
import { listPayables, getPayableDetail } from "@/lib/debts/payable-repo";
import type { DebtAccountRow, DebtAccountDetail } from "./types";

const METHOD_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADOPAGO: "Mercado Pago",
};

export async function getReceivables(): Promise<DebtAccountRow[]> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const items = await listReceivables(tenantId);
  return items.map((r) => ({
    id: r.id,
    contraparte: r.clientName,
    total: r.amount,
    saldado: r.collected,
    saldo: r.balance,
    vencimiento: r.dueDate,
    referencia: r.concept,
  }));
}

export async function getReceivable(id: string): Promise<DebtAccountDetail | null> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const d = await getReceivableDetail(tenantId, id);
  if (!d) return null;
  return {
    id: d.id,
    contraparte: d.clientName,
    total: d.amount,
    saldado: d.collected,
    saldo: d.balance,
    vencimiento: d.dueDate,
    referencia: d.concept,
    historial: d.collections.map((c) => ({
      id: c.id,
      fecha: c.at,
      monto: c.amount,
      metodo: METHOD_LABEL[c.method] ?? c.method,
      nota: c.note,
    })),
    // El fiado no tiene cheques.
  };
}

export async function getPayables(): Promise<DebtAccountRow[]> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const items = await listPayables(tenantId);
  return items.map((p) => ({
    id: p.id,
    contraparte: p.supplierName,
    total: p.amount,
    saldado: p.paid,
    saldo: p.balance,
    vencimiento: p.dueDate,
    referencia: p.concept,
  }));
}

export async function getPayable(id: string): Promise<DebtAccountDetail | null> {
  await requireCapability("billing:manage");
  const tenantId = await getCurrentTenantId();
  const d = await getPayableDetail(tenantId, id);
  if (!d) return null;
  return {
    id: d.id,
    contraparte: d.supplierName,
    total: d.amount,
    saldado: d.paid,
    saldo: d.balance,
    vencimiento: d.dueDate,
    referencia: d.concept,
    historial: d.payments.map((p) => ({
      id: p.id,
      fecha: p.at,
      monto: p.amount,
      metodo: METHOD_LABEL[p.method] ?? p.method,
      nota: p.note,
    })),
    cheques: d.cheques.map((ch) => ({
      numero: ch.chequeNumber,
      banco: ch.bank,
      monto: ch.amount,
      fechaDiferida: ch.dueDate,
      estado: ch.status,
      endosadoA: ch.endorsedTo,
    })),
  };
}
