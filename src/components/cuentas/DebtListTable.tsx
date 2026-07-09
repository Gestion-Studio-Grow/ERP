"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DataTable,
  textColumn,
  moneyColumn,
  dateColumn,
  statusColumn,
  type DataTableColumn,
  type DataTableSort,
} from "@/components/ui";
import type { DebtAccountRow } from "@/lib/cuentas/types";
import type { Aging } from "@/lib/cuentas/aging";

/** Fila del listado con su aging YA computado en el server (evita mismatch de hidratación). */
export type DebtRowVM = DebtAccountRow & { aging: Aging };

// Listado de cuentas de deuda (a cobrar / a pagar) sobre el DataTable de S2. El semáforo
// de aging (estado→tono) es negocio de la entidad (ver `@/lib/cuentas/aging`) — la única
// excepción al canal neutro (ADR-059 D5). DataTable es controlado: acá vive el orden.
export function DebtListTable({
  rows,
  contraparteLabel,
  detailBase,
  caption,
}: {
  rows: DebtRowVM[];
  /** "Cliente" (a cobrar) o "Proveedor" (a pagar). */
  contraparteLabel: string;
  /** Base del href de detalle, ej. "/admin/cuentas-a-cobrar". */
  detailBase: string;
  caption: string;
}) {
  const [sort, setSort] = useState<DataTableSort>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "saldo":
          return (a.saldo - b.saldo) * dir;
        case "total":
          return (a.total - b.total) * dir;
        case "vencimiento": {
          // Sin vencimiento va siempre al final, sin importar la dirección.
          const av = a.vencimiento ? a.vencimiento.getTime() : Infinity;
          const bv = b.vencimiento ? b.vencimiento.getTime() : Infinity;
          if (av === bv) return 0;
          if (av === Infinity) return 1;
          if (bv === Infinity) return -1;
          return (av - bv) * dir;
        }
        default:
          return String(a.contraparte).localeCompare(String(b.contraparte), "es-AR") * dir;
      }
    });
  }, [rows, sort]);

  const columns: DataTableColumn<DebtRowVM>[] = [
    textColumn<DebtRowVM>(
      "contraparte",
      contraparteLabel,
      (r) => (
        <Link href={`${detailBase}/${r.id}`} className="font-medium text-accent hover:underline">
          {r.contraparte}
        </Link>
      ),
      { sortable: true },
    ),
    textColumn<DebtRowVM>("referencia", "Referencia", (r) => r.referencia ?? "—"),
    moneyColumn<DebtRowVM>("total", "Total", (r) => r.total, { sortable: true }),
    moneyColumn<DebtRowVM>("saldo", "Saldo", (r) => r.saldo, { sortable: true }),
    dateColumn<DebtRowVM>("vencimiento", "Vence", (r) => r.vencimiento, { sortable: true }),
    statusColumn<DebtRowVM>("aging", "Estado", (r) => ({ label: r.aging.label, tone: r.aging.tone })),
  ];

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={sorted}
      rowKey={(r) => r.id}
      sort={sort}
      onSortChange={setSort}
    />
  );
}
