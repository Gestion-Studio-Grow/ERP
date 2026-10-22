// FACTURITA · Mis facturas — lista simple con estado ARCA, CAE y número, y el PDF de las autorizadas.
// Reusa el estado fiscal del Core (getFacturacion), sin duplicar lógica.

import { PageHeader, Badge, EmptyState, fmtMoneyARS } from "@/components/ui";
import { getFacturacion } from "@/lib/facturacion-actions";
import { requireCapability } from "@/lib/authz";
import { fmtShortDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function fechaArcaADate(aaaammdd: string): Date {
  return new Date(
    Number(aaaammdd.slice(0, 4)),
    Number(aaaammdd.slice(4, 6)) - 1,
    Number(aaaammdd.slice(6, 8)),
  );
}

export default async function FacturitaFacturasPage() {
  await requireCapability("billing:manage");
  const { facturas } = await getFacturacion();

  return (
    <>
      <PageHeader
        title="Mis facturas"
        description="Todas las que emitiste, con su estado en ARCA. Las autorizadas se descargan en PDF para mandárselas a tu cliente."
      />
      {facturas.length === 0 ? (
        <EmptyState
          title="Todavía no emitiste ninguna"
          description="La primera sale desde la pestaña Emitir, en menos de un minuto."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised shadow-card">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <caption className="sr-only">Facturas emitidas</caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-[11px] font-semibold uppercase tracking-[.06em] text-muted">
                <th scope="col" className="px-[22px] py-[9px]">Fecha</th>
                <th scope="col" className="px-[22px] py-[9px]">Número</th>
                <th scope="col" className="px-[22px] py-[9px]">Estado</th>
                <th scope="col" className="px-[22px] py-[9px] text-right">Total</th>
                <th scope="col" className="px-[22px] py-[9px]"><span className="sr-only">PDF</span></th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-line-soft last:border-b-0">
                  <td className="whitespace-nowrap px-[22px] py-[13px] tabular-nums text-muted">
                    {fmtShortDate(fechaArcaADate(f.fecha))}
                  </td>
                  <td className="whitespace-nowrap px-[22px] py-[13px] font-mono text-strong">
                    {f.numero != null
                      ? `${String(f.puntoVenta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")}`
                      : "—"}
                  </td>
                  <td className="px-[22px] py-[13px]">
                    {f.status === "AUTHORIZED" ? (
                      <Badge tone="success" dot>Autorizada</Badge>
                    ) : f.status === "REJECTED" ? (
                      <Badge tone="danger" dot>Rechazada</Badge>
                    ) : (
                      <Badge tone="neutral" dot>Pendiente</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-[22px] py-[13px] text-right font-semibold tabular-nums text-strong">
                    {fmtMoneyARS(Number(f.total))}
                  </td>
                  <td className="whitespace-nowrap px-[22px] py-[13px] text-right">
                    {f.status === "AUTHORIZED" && (
                      // Descarga, no navegación: <a> plano (un Link de Next intentaría prefetch de un PDF).
                      <a
                        href={`/facturita/app/facturas/${f.id}/pdf`}
                        className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        aria-label={`Descargar en PDF la factura ${f.numero != null ? `${String(f.puntoVenta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")}` : ""}`}
                      >
                        PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
