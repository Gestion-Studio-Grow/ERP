"use client";

import { useMemo, useState } from "react";
import {
  DataTable,
  textColumn,
  numberColumn,
  moneyColumn,
  statusColumn,
  fmtMoneyARS,
  type DataTableColumn,
  type DataTableSort,
} from "@/components/ui";
import type { InventoryRow } from "@/lib/inventario/valuation";

// Inventario read-only: niveles de stock + valuación por producto sobre el DataTable de
// S2. El único semáforo (canal neutro salvo esto) es "Stock bajo" (warning). DataTable es
// controlado → el orden vive acá (por stock o valuación).
export function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  const [sort, setSort] = useState<DataTableSort>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "stock":
          return (a.stock - b.stock) * dir;
        case "valuation":
          return (a.valuation - b.valuation) * dir;
        default:
          return String(a.name).localeCompare(String(b.name), "es-AR") * dir;
      }
    });
  }, [rows, sort]);

  const columns: DataTableColumn<InventoryRow>[] = [
    textColumn<InventoryRow>("name", "Producto", (r) => r.name, { sortable: true }),
    numberColumn<InventoryRow>("stock", "Stock", (r) => r.stock, { sortable: true, decimals: 3 }),
    textColumn<InventoryRow>("unit", "Unidad", (r) => r.unit),
    moneyColumn<InventoryRow>("unitCost", "Costo unit.", (r) => (r.sinCosto ? null : r.unitCost)),
    {
      key: "valuation",
      header: "Valuación",
      align: "right",
      sortable: true,
      cell: (r) => (r.sinCosto ? <span className="text-muted">—</span> : fmtMoneyARS(r.valuation)),
    },
    statusColumn<InventoryRow>("estado", "Estado", (r) =>
      r.belowLowStock ? { label: "Stock bajo", tone: "warning" } : { label: "OK", tone: "neutral" },
    ),
  ];

  return (
    <DataTable
      caption="Niveles de stock y valuación por producto"
      columns={columns}
      rows={sorted}
      rowKey={(r) => r.productId}
      sort={sort}
      onSortChange={setSort}
    />
  );
}
