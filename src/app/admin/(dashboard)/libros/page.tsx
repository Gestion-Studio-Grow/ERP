import Link from "next/link";
import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getLibroIva } from "@/lib/libros/libro-iva-loader";
import { REPORT_RANGE_DAYS, DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import { PageHeader, EmptyState, buttonClasses } from "@/components/ui";
import LibrosClient from "./LibrosClient";

export const dynamic = "force-dynamic";

const money = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tarjeta de resumen fiscal (número grande + contexto). `tone` tiñe el saldo.
function Stat({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint?: string; tone?: "neutral" | "danger" | "success" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-strong";
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function LibrosPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requireCapability("reports:read");
  // Perfil (ADR-060 D7): "Libros / Exportar al contador" es de la edición Empresa. Con
  // el motor de perfiles OFF o en Comercio, la pantalla se anuncia como Empresa y no
  // computa nada (perfilMin=enterprise, detrás de flags — coherente con la nav).
  const profile = await getActiveProfile();
  if (profile !== "enterprise") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader
          title="Libros / Exportar al contador"
          description="Libro IVA (Ventas y Compras) con los datos que usa tu contador."
        />
        <EmptyState
          title="Disponible en la edición Empresa"
          description="El Libro IVA y la exportación al contador son parte de la edición Empresa."
        />
      </main>
    );
  }

  const { dias } = await searchParams;
  const parsed = Number(dias);
  const rangeDays = (REPORT_RANGE_DAYS as readonly number[]).includes(parsed) ? parsed : DEFAULT_REPORT_RANGE_DAYS;
  const { libro, desde, hasta } = await getLibroIva(rangeDays);
  const r = libro.resumen;
  const saldoAPagar = r.ivaSaldo >= 0;

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Libros / Exportar al contador"
        description={`Libro IVA (Ventas y Compras) del ${desde} al ${hasta}. Derivado de tus ventas —mostrador y servicios— y compras. No reemplaza la factura fiscal: es el resumen para tu contador.`}
        actions={
          <a href={`/admin/libros/export?dias=${rangeDays}`} className={buttonClasses("outline", "sm", "whitespace-nowrap")}>
            ↓ Exportar al contador
          </a>
        }
      />

      {/* Selector de período (mismo criterio que Reportes, ADR-023 F3). */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Período:</span>
        {REPORT_RANGE_DAYS.map((d) => {
          const active = d === rangeDays;
          return (
            <Link
              key={d}
              href={`/admin/libros?dias=${d}`}
              className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                active ? "border-line-strong bg-surface-raised font-medium text-strong" : "border-line text-muted hover:border-line-strong"
              }`}
            >
              {d === 365 ? "1 año" : `${d} días`}
            </Link>
          );
        })}
      </div>

      {/* Resumen fiscal: IVA débito (ventas) − crédito (compras) = saldo. */}
      <div className="mb-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Ventas (neto)" value={money(r.ventasNeto)} hint={`${r.ventasCount} ${r.ventasCount === 1 ? "venta" : "ventas"}`} />
        <Stat label="IVA débito" value={money(r.ivaDebito)} hint="IVA de ventas" />
        <Stat label="IVA crédito" value={money(r.ivaCredito)} hint="IVA de compras" />
        <Stat
          label={saldoAPagar ? "Saldo IVA a pagar" : "Saldo IVA a favor"}
          value={money(Math.abs(r.ivaSaldo))}
          tone={saldoAPagar ? "danger" : "success"}
          hint="débito − crédito"
        />
      </div>

      {(r.ventasEstimadas > 0 || r.comprasEstimadas > 0) && (
        <p className="mb-6 rounded-lg border border-warning-soft bg-warning-soft/40 px-4 py-2.5 text-sm text-body">
          <span className="font-medium text-warning">Filas estimadas:</span>{" "}
          {r.ventasEstimadas} ventas y {r.comprasEstimadas} compras sin comprobante fiscal — el IVA se derivó del
          total al 21%. Las de origen <span className="font-medium">Comprobante</span> vienen de facturas ARCA
          (montos exactos). Conciliá con tu contador.
        </p>
      )}

      {libro.ventas.length === 0 && libro.compras.length === 0 ? (
        <EmptyState
          title="Sin movimientos en el período"
          description="No hay ventas ni compras registradas en el rango elegido. Probá con un período más amplio."
        />
      ) : (
        <LibrosClient ventas={libro.ventas} compras={libro.compras} />
      )}
    </main>
  );
}
