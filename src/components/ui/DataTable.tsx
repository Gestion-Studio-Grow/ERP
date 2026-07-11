"use client";

import { cn } from "./cn";
import { EmptyState } from "./EmptyState";
import { nextSort, ariaSortFor, type DataTableSort } from "./data-table-sort";

export type { DataTableSort, SortDirection } from "./data-table-sort";

// DataTable — el subsistema de grilla/lista de datos que ADR-059 D6 dejó
// afuera de "los 8" primitivos (fix Challenger #5: "es de lo más difícil de
// hacer bien"). Va acá, como su propio hito, autorizado por el dueño para
// dar base común a las pantallas de datos del producto (cuentas a pagar/
// cobrar, inventario, contabilidad, devoluciones…).
//
// SIN lógica de datos: es CONTROLADO — no ordena filas ni pagina ni
// fetchea. Recibe `rows` ya en el orden que quiere mostrar y, si alguna
// columna es sorteable, avisa por `onSortChange` cuándo el usuario pidió
// cambiar de orden (el llamador decide cómo re-ordenar/re-fetchear).
//
// Responsive (D6 "adaptable"): en mobile las filas colapsan a tarjetas
// apiladas con el header de cada campo inline — el mismo patrón ya usado a
// mano en `auditoria/page.tsx` (bg-surface-sunken para el header, colapso
// `block`/`table` por breakpoint), ahora generalizado. El header <thead> se
// oculta en mobile (no hay lugar para una fila de columnas); si hay
// columnas sorteables, aparece un toolbar de chips (`.chip-btn`, ya
// definido en globals.css) para poder ordenar igual desde el celular.
//
// Densidad (D4): paddings en la escala `--space-*` — respira más en lite,
// más compacto en enterprise, sin tocar el componente.
// Canal neutro (D5 por extensión): cero `--accent` en la grilla en sí — la
// tabla es neutra; el color vive en lo que el llamador ponga DENTRO de una
// celda (ej. un Badge de estado).
// Vacío: reusa `EmptyState` (sin duplicar el patrón).
// Fuera de alcance de este hito (deliberado, no un olvido): paginación —
// ADR-059 D6 la menciona como parte del subsistema completo, pero no la
// pidió esta ola; queda como follow-up natural cuando haya una pantalla real
// que la necesite. Tampoco hay fila-clicable/navegación (eso es lógica de
// producto, la arma el llamador con su propio `cell`).

export type DataTableColumn<T> = {
  key: string;
  /** Texto del header. Si `sortable`, DataTable arma el botón de orden alrededor. */
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Título accesible de la tabla (siempre requerido — va a un <caption> sr-only). */
  caption: string;
  loading?: boolean;
  /** Reemplaza el EmptyState por default cuando no hay filas y no está cargando. */
  emptyState?: React.ReactNode;
  sort?: DataTableSort;
  onSortChange?: (next: DataTableSort) => void;
  className?: string;
};

// Las filas fantasma viven en data-table-skeleton.ts (módulo sin "use client")
// para que los loading.tsx de ruta —server components— las importen sin cruzar
// la frontera RSC (importarlas desde acá les llegaba como client-reference y
// `.map` reventaba en runtime). Se re-exporta para los consumidores client.
import { SKELETON_ROWS } from "./data-table-skeleton";
export { SKELETON_ROWS } from "./data-table-skeleton";

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  loading = false,
  emptyState,
  sort = null,
  onSortChange,
  className,
}: DataTableProps<T>) {
  const isEmpty = !loading && rows.length === 0;
  const sortableColumns = columns.filter((c) => c.sortable);

  return (
    <div className={className}>
      {sortableColumns.length > 0 && (
        <div className="mb-xs flex flex-wrap gap-2xs sm:hidden" role="group" aria-label="Ordenar tabla">
          {sortableColumns.map((col) => (
            <button
              key={col.key}
              type="button"
              aria-pressed={sort?.key === col.key}
              onClick={() => onSortChange?.(nextSort(sort, col.key))}
              className="chip-btn min-h-[var(--tap-min)] gap-1.5"
            >
              {col.header}
              <SortIcon direction={sort?.key === col.key ? sort.direction : undefined} />
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
        <table className="block sm:table w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="hidden sm:table-header-group">
            {/* Header del mockup (fix 17): 11px / 600 / tracking .06em / uppercase. */}
            <tr className="border-b border-line bg-surface-sunken text-[11px] uppercase tracking-[.06em] text-muted">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? ariaSortFor(sort, col.key) : undefined}
                  className={cn(
                    "px-[22px] py-xs font-semibold",
                    col.align === "right" && "text-right",
                    col.className,
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => onSortChange?.(nextSort(sort, col.key))}
                      className={cn(
                        "inline-flex min-h-[var(--tap-min)] items-center gap-1 rounded",
                        "hover:text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                        col.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {col.header}
                      <SortIcon direction={sort?.key === col.key ? sort.direction : undefined} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {loading &&
              SKELETON_ROWS.map((skeletonKey) => (
                <tr key={skeletonKey} className="block sm:table-row border-t border-line first:border-t-0 sm:first:border-t">
                  {columns.map((col) => (
                    <td key={col.key} className="block sm:table-cell px-sm py-2xs sm:px-[22px] sm:py-[13px]">
                      <span
                        aria-hidden="true"
                        className="block h-4 w-full max-w-32 rounded bg-surface-sunken motion-safe:animate-pulse"
                      />
                    </td>
                  ))}
                </tr>
              ))}

            {isEmpty && (
              <tr className="block sm:table-row">
                <td colSpan={columns.length} className="block sm:table-cell p-0">
                  {emptyState ?? (
                    <EmptyState title="No hay datos para mostrar" className="rounded-none border-0 bg-transparent" />
                  )}
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    "block sm:table-row rounded-lg border border-line sm:rounded-none sm:border-0",
                    "sm:border-t sm:first:border-t-0 sm:hover:bg-surface-sunken transition-colors",
                    "mb-xs sm:mb-0 px-sm py-2xs sm:px-0 sm:py-0",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        // Densidad de celda del mockup (fix 18): 22px / 13px en desktop.
                        "block sm:table-cell px-0 py-3xs sm:px-[22px] sm:py-[13px] text-body",
                        col.align === "right" && "text-right",
                        col.className,
                      )}
                    >
                      <span className="sm:hidden mr-1.5 text-xs uppercase tracking-wide text-faint">
                        {col.header}:{" "}
                      </span>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortIcon({ direction }: { direction?: "asc" | "desc" }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={cn(
        "size-3 shrink-0 fill-current transition-transform",
        direction === "desc" && "rotate-180",
        !direction && "opacity-40",
      )}
    >
      <path d="M6 2.5 9.5 7h-7z" />
    </svg>
  );
}
