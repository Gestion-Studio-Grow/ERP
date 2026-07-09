"use client";

import { useMemo, useState } from "react";
import { DataTable, type DataTableColumn, type DataTableSort } from "@/components/ui";
import type { VentaRow, CompraRow } from "@/lib/libros/libro-iva";

const money = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (f: number) => (f * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "%";

// Origen de la fila: comprobante fiscal (exacto) vs estimado 21% (derivado del bruto).
// Canal neutro: el "comprobante" usa el token success (dato firme); el estimado, muted.
function OrigenBadge({ fuente }: { fuente: "comprobante" | "estimado" }) {
  return fuente === "comprobante" ? (
    <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">Comprobante</span>
  ) : (
    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-muted">Estimado</span>
  );
}

// Orden client-side (DataTable es controlado): ordena las filas por la columna pedida.
function useSorted<T extends Record<string, unknown>>(rows: T[], numericKeys: ReadonlySet<string>) {
  const [sort, setSort] = useState<DataTableSort>(null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const { key, direction } = sort;
    const dir = direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (numericKeys.has(key)) return ((a[key] as number) - (b[key] as number)) * dir;
      return String(a[key]).localeCompare(String(b[key]), "es-AR") * dir;
    });
  }, [rows, sort, numericKeys]);
  return { sorted, sort, setSort };
}

const VENTAS_NUM = new Set(["neto", "iva", "total"]);
const COMPRAS_NUM = new Set(["neto", "iva", "total"]);

export default function LibrosClient({ ventas, compras }: { ventas: VentaRow[]; compras: CompraRow[] }) {
  const v = useSorted(ventas as unknown as Record<string, unknown>[], VENTAS_NUM);
  const c = useSorted(compras as unknown as Record<string, unknown>[], COMPRAS_NUM);

  const ventasCols: DataTableColumn<VentaRow>[] = [
    { key: "fecha", header: "Fecha", sortable: true, cell: (r) => r.fecha },
    { key: "tipo", header: "Tipo", cell: (r) => r.tipo },
    { key: "numero", header: "Número", cell: (r) => r.numero },
    { key: "cliente", header: "Cliente", cell: (r) => r.cliente },
    { key: "doc", header: "Documento", cell: (r) => r.doc },
    { key: "neto", header: "Neto", sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{money(r.neto)}</span> },
    { key: "alicuota", header: "Alíc.", align: "right", cell: (r) => <span className="tabular-nums">{pct(r.alicuota)}</span> },
    { key: "iva", header: "IVA", sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{money(r.iva)}</span> },
    { key: "total", header: "Total", sortable: true, align: "right", cell: (r) => <span className="tabular-nums font-medium">{money(r.total)}</span> },
    { key: "fuente", header: "Origen", cell: (r) => <OrigenBadge fuente={r.fuente} /> },
  ];

  const comprasCols: DataTableColumn<CompraRow>[] = [
    { key: "fecha", header: "Fecha", sortable: true, cell: (r) => r.fecha },
    { key: "proveedor", header: "Proveedor", cell: (r) => r.proveedor },
    { key: "doc", header: "Documento", cell: (r) => r.doc },
    { key: "numero", header: "Número", cell: (r) => r.numero },
    { key: "neto", header: "Neto", sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{money(r.neto)}</span> },
    { key: "alicuota", header: "Alíc.", align: "right", cell: (r) => <span className="tabular-nums">{pct(r.alicuota)}</span> },
    { key: "iva", header: "IVA", sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{money(r.iva)}</span> },
    { key: "total", header: "Total", sortable: true, align: "right", cell: (r) => <span className="tabular-nums font-medium">{money(r.total)}</span> },
    { key: "fuente", header: "Origen", cell: (r) => <OrigenBadge fuente={r.fuente} /> },
  ];

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-strong">Libro IVA Ventas <span className="text-sm font-normal text-muted">(IVA débito)</span></h2>
        <DataTable
          caption="Libro IVA Ventas del período"
          columns={ventasCols}
          rows={v.sorted as unknown as VentaRow[]}
          rowKey={(r) => `${r.fecha}-${r.tipo}-${r.numero}-${r.total}`}
          sort={v.sort}
          onSortChange={v.setSort}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-strong">Libro IVA Compras <span className="text-sm font-normal text-muted">(IVA crédito)</span></h2>
        <DataTable
          caption="Libro IVA Compras del período"
          columns={comprasCols}
          rows={c.sorted as unknown as CompraRow[]}
          rowKey={(r) => `${r.fecha}-${r.proveedor}-${r.numero}-${r.total}`}
          sort={c.sort}
          onSortChange={c.setSort}
        />
      </section>
    </div>
  );
}
