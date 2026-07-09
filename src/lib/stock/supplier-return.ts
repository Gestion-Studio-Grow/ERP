// ============================================================================
// DEVOLUCIÓN A PROVEEDOR (D4, ADR-060) — servicio de DOS patas, atómico.
// ============================================================================
//
// Devolver mercadería a un proveedor tiene DOS efectos que deben pasar juntos o ninguno:
//  (a) STOCK: sale del inventario → un movimiento `DEVOLUCION_PROVEEDOR` en el ledger
//      existente (revierte COGS al costo original, rastro `purchaseId` a la compra origen).
//  (b) FINANCIERA: baja lo que le debemos al proveedor → un crédito en su `AccountPayable`
//      (asentado como Collection PAYABLE, que baja el saldo — es el mecanismo de nota de
//      crédito por devolución). SIN esto la devolución quedaría "solo-stock" (el error que
//      el Gate/Opus marcó: rehacerla cuando aparezca cuentas a pagar).
//
// Ambas patas corren en UNA transacción tenant-aware SERIALIZABLE: si el crédito excede el
// saldo de la deuda (guarda de `applyCollectionInTx`) o falla el descuento de stock, se
// aborta TODO — nunca stock revertido sin crédito, ni crédito sin stock. Serializable + retry
// protege el saldo contra concurrencia (mismo fix del path de dinero).
//
// ⚠️ Requiere el enum value `StockMovementType.DEVOLUCION_PROVEEDOR` — migración ADITIVA
// PREPARADA y SIN aplicar a prod (§C · Gate 2).

import { tenantTransaction } from "@/lib/rls";
import { prisma } from "@/lib/prisma";
import { Prisma, type $Enums } from "@/generated/prisma/client";
import { recordMovement } from "@/lib/stock/ledger";
import { applyCollectionInTx } from "@/lib/settlement/collection-repo";

export interface SupplierReturnArgs {
  /** Producto que se devuelve. */
  productId: string;
  /** Cantidad devuelta (magnitud, sin signo; el ledger la resta). */
  qty: number;
  /** Costo unitario ORIGINAL de la compra (para revertir COGS al valor que entró). */
  unitCost: number;
  /** Rastro a la compra que originó la mercadería (opcional). */
  purchaseId?: string | null;
  /** Etiqueta del producto para el mensaje de faltante (opcional). */
  label?: string;
  /** Motivo de la devolución (vencido, fallado, error de pedido…). */
  reason?: string | null;
  /** Cuenta a pagar del proveedor a acreditar. Omitir si la devolución no cancela deuda. */
  payableId?: string | null;
  /** Monto financiero a acreditar en la deuda. Default: qty × unitCost. */
  creditAmount?: number;
  /** Actor "user:<id>". */
  by: string;
}

export interface SupplierReturnResult {
  /** Stock resultante del producto tras la salida. */
  stockAfter: number;
  /** Crédito asentado en la deuda (0 si no se acreditó a ninguna). */
  credited: number;
  /** Saldo pendiente de la deuda tras el crédito (null si no se acreditó a ninguna). */
  payableBalanceAfter: number | null;
}

/**
 * Asienta una devolución a proveedor en sus dos patas (stock + financiera), atómico.
 * Si `payableId` viene, acredita `creditAmount` (o qty×unitCost) contra esa deuda vía
 * Collection PAYABLE (baja el saldo). Si no viene, solo mueve el stock (devolución sin
 * imputar a una deuda puntual — p. ej. mercadería que ya se había pagado al contado).
 */
export async function recordSupplierReturn(
  tenantId: string,
  args: SupplierReturnArgs,
): Promise<SupplierReturnResult> {
  const credit = args.creditAmount ?? args.qty * args.unitCost;

  return tenantTransaction(
    async (tx) => {
      // (a) Pata STOCK: sale del inventario. `recordMovement` compone dentro de esta tx.
      const stockAfter = await recordMovement(tx, {
        tenantId,
        productId: args.productId,
        type: "DEVOLUCION_PROVEEDOR",
        qty: args.qty,
        unitCost: args.unitCost, // snapshot del costo que sale (revierte COGS)
        reason: args.reason ?? "Devolución a proveedor",
        purchaseId: args.purchaseId ?? null,
        createdBy: args.by,
        label: args.label,
      });

      // (b) Pata FINANCIERA: crédito en la deuda (baja el saldo) si se imputa a una AP.
      let credited = 0;
      let payableBalanceAfter: number | null = null;
      if (args.payableId) {
        const payable = await tx.accountPayable.findFirst({
          where: { id: args.payableId, tenantId },
          select: { amount: true },
        });
        if (!payable) throw new Error("Cuenta a pagar no encontrada para acreditar la devolución.");

        const res = await applyCollectionInTx(tx, tenantId, {
          originType: "PAYABLE",
          originId: args.payableId,
          totalCharged: payable.amount.toNumber(),
          amount: credit,
          method: "TRANSFERENCIA" as $Enums.PaymentMethod, // nota de crédito por devolución (ver note)
          note: `Nota de crédito por devolución a proveedor${args.reason ? ` (${args.reason})` : ""}`,
          collectedBy: args.by,
        });
        credited = res.amount;
        payableBalanceAfter = res.settlement.balance;
      }

      return { stockAfter, credited, payableBalanceAfter };
    },
    // Serializable: la pata financiera comparte el saldo de la deuda con cobros/pagos
    // concurrentes → misma protección que el resto del path de dinero.
    { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export interface SupplierReturnRow {
  id: string;
  productId: string | null;
  productName: string;
  qty: number; // magnitud devuelta (positiva)
  unitCost: number | null;
  /** Valor de la devolución (qty × unitCost), para el reporte. */
  value: number;
  reason: string | null;
  purchaseId: string | null;
  at: Date;
  by: string;
}

/**
 * Lista las devoluciones a proveedor del tenant (movimientos DEVOLUCION_PROVEEDOR del
 * ledger), de la más reciente a la más vieja. Read-only, para la pantalla de devoluciones.
 */
export async function listSupplierReturns(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<SupplierReturnRow[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { tenantId, type: "DEVOLUCION_PROVEEDOR" },
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
  });

  return rows.map((m) => {
    const qty = Math.abs(m.qty); // el ledger la guarda firmada (negativa); la mostramos positiva
    const unitCost = m.unitCost;
    return {
      id: m.id,
      productId: m.productId,
      productName: m.product?.name ?? "(producto eliminado)",
      qty,
      unitCost,
      value: unitCost != null ? Math.round(qty * unitCost * 100) / 100 : 0,
      reason: m.reason,
      purchaseId: m.purchaseId,
      at: m.createdAt,
      by: m.createdBy,
    };
  });
}
