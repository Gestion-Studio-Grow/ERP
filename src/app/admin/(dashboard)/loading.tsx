// Skeleton de carga del backoffice (gate UX/UI, fix 4) — "honesto": replica la
// anatomía real de las pantallas de datos (PageHeader + 4 KPIs + tabla) en vez
// de un spinner genérico, así el contenido no "salta" al llegar. Reusa las
// SKELETON_ROWS de DataTable (mismas filas fantasma que la tabla real) y los
// tokens del sistema (bg-surface-sunken + animate-pulse con guard de motion).

import { PageContainer } from "@/components/ui";
// OJO frontera RSC: importar desde DataTable.tsx ("use client") entregaba un
// client-reference en este server component y SKELETON_ROWS.map daba 500.
import { SKELETON_ROWS } from "@/components/ui/data-table-skeleton";

function Bar({ className }: { className: string }) {
  return <span aria-hidden className={`block rounded bg-surface-sunken motion-safe:animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <PageContainer>
      <span className="sr-only" role="status">Cargando…</span>

      {/* PageHeader fantasma */}
      <header className="mb-lg" aria-hidden>
        <Bar className="h-7 w-64" />
        <Bar className="mt-3 h-4 w-96 max-w-full" />
      </header>

      {/* 4 KpiTile fantasma (misma grilla que las pantallas reales, fix 28) */}
      <div aria-hidden className="mb-xl grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        {["kpi-1", "kpi-2", "kpi-3", "kpi-4"].map((k) => (
          <div key={k} className="rounded-xl border border-line bg-surface-raised p-md shadow-xs">
            <div className="flex items-center justify-between">
              <Bar className="h-3 w-24" />
              <Bar className="size-8 rounded-lg" />
            </div>
            <Bar className="mt-[7px] h-7 w-28" />
            <Bar className="mt-[7px] h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Tabla fantasma — las mismas filas skeleton que DataTable */}
      <div aria-hidden className="overflow-hidden rounded-xl border border-line bg-surface-raised">
        <div className="border-b border-line bg-surface-sunken px-[22px] py-2.5">
          <Bar className="h-3 w-40" />
        </div>
        {SKELETON_ROWS.map((k) => (
          <div key={k} className="flex items-center gap-6 border-b border-line px-[22px] py-[13px] last:border-b-0">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-4 w-1/4" />
            <Bar className="h-4 w-1/5" />
            <Bar className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
