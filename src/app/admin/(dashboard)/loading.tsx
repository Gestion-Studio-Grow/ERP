// Skeleton de carga del backoffice (gate UX/UI, fix 4) — "honesto": replica la
// anatomía real de las pantallas de datos (PageHeader + 4 KPIs + tabla) en vez
// de un spinner genérico, así el contenido no "salta" al llegar. Reusa las
// SKELETON_ROWS de DataTable (mismas filas fantasma que la tabla real) y los
// tokens del sistema. Los esqueletos son los comunes de @/components/ui (Esqueleto y
// KpiTileEsqueleto): el mismo dibujo que el Inicio y NumeroKpi.

import { Esqueleto, KpiTileEsqueleto, PageContainer } from "@/components/ui";
// OJO frontera RSC: importar desde DataTable.tsx ("use client") entregaba un
// client-reference en este server component y SKELETON_ROWS.map daba 500.
import { SKELETON_ROWS } from "@/components/ui/data-table-skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <span className="sr-only" role="status">Cargando…</span>

      {/* PageHeader fantasma */}
      <header className="mb-lg" aria-hidden>
        <Esqueleto className="h-7 w-64" />
        <Esqueleto className="mt-3 h-4 w-96 max-w-full" />
      </header>

      {/* 4 KpiTile fantasma (misma grilla que las pantallas reales, fix 28) */}
      <div aria-hidden className="mb-xl grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
        {["kpi-1", "kpi-2", "kpi-3", "kpi-4"].map((k) => (
          <KpiTileEsqueleto key={k} />
        ))}
      </div>

      {/* Tabla fantasma — las mismas filas skeleton que DataTable */}
      <div aria-hidden className="overflow-hidden rounded-xl border border-line bg-surface-raised">
        <div className="border-b border-line bg-surface-sunken px-[22px] py-2.5">
          <Esqueleto className="h-3 w-40" />
        </div>
        {SKELETON_ROWS.map((k) => (
          <div key={k} className="flex items-center gap-6 border-b border-line px-[22px] py-[13px] last:border-b-0">
            <Esqueleto className="h-4 w-1/3" />
            <Esqueleto className="h-4 w-1/4" />
            <Esqueleto className="h-4 w-1/5" />
            <Esqueleto className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
