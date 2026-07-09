"use client";

import { DataTable, dateColumn, moneyColumn, textColumn, type DataTableColumn } from "@/components/ui";
import type { ReturnHistoryRow } from "@/lib/devoluciones/types";

// Historial de devoluciones a proveedor (read-only) sobre el DataTable de S2. Canal
// neutro. El "crédito" es la baja del saldo que le debemos al proveedor (D2/D4).
export function ReturnHistoryTable({ rows }: { rows: ReturnHistoryRow[] }) {
  const columns: DataTableColumn<ReturnHistoryRow>[] = [
    dateColumn<ReturnHistoryRow>("fecha", "Fecha", (r) => r.fecha),
    textColumn<ReturnHistoryRow>("proveedor", "Proveedor", (r) => r.proveedor),
    textColumn<ReturnHistoryRow>("detalle", "Devuelto", (r) => r.detalle),
    textColumn<ReturnHistoryRow>("motivo", "Motivo", (r) => r.motivo),
    moneyColumn<ReturnHistoryRow>("credito", "Crédito", (r) => r.credito),
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
