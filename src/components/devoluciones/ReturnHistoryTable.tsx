"use client";

import { DataTable, dateColumn, moneyColumn, numberColumn, textColumn, type DataTableColumn } from "@/components/ui";
import type { ReturnHistoryRow } from "@/lib/devoluciones/types";

// Historial de devoluciones a proveedor (read-only) sobre el DataTable de S2. Una fila por
// producto devuelto (así lo asienta el ledger de S1). Canal neutro. El "valor" es el crédito
// generado en la cuenta a pagar del proveedor (D2/D4).
export function ReturnHistoryTable({ rows }: { rows: ReturnHistoryRow[] }) {
  const columns: DataTableColumn<ReturnHistoryRow>[] = [
    dateColumn<ReturnHistoryRow>("fecha", "Fecha", (r) => r.fecha),
    textColumn<ReturnHistoryRow>("producto", "Producto", (r) => r.producto),
    numberColumn<ReturnHistoryRow>("cantidad", "Cantidad", (r) => r.cantidad, { decimals: 3 }),
    textColumn<ReturnHistoryRow>("motivo", "Motivo", (r) => r.motivo),
    moneyColumn<ReturnHistoryRow>("valor", "Crédito", (r) => r.valor),
  ];
  return (
    <DataTable
      caption="Historial de devoluciones a proveedor"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      emptyState={<p className="px-4 py-6 text-sm text-muted">Todavía no se registró ninguna devolución.</p>}
    />
  );
}
