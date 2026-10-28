// FACTURITA · Mis facturas — lista simple con estado ARCA, número y PDF de las autorizadas, y
// «Anular» con nota de crédito (motor: crearNotaDeCredito). Si una autorizada es de prueba sale del
// ambiente en que se autorizó (deducido como lo hace el PDF: Invoice no lo guarda), no del de hoy.

import { PageHeader, Badge, EmptyState, fmtMoneyARS } from "@/components/ui";
import { facturasFacturitaAction } from "@/lib/facturita-actions";
import { fechaFiscalLegible, motivoLegible, origenDelRechazo } from "@/lib/facturita-core";
import AnularFactura from "./AnularFactura";

export const dynamic = "force-dynamic";

const CELDA = "px-[22px] py-[13px]";

export default async function FacturitaFacturasPage() {
  const facturas = await facturasFacturitaAction();
  const hayDePrueba = facturas.some((f) => f.ambiente === "prueba");

  return (
    <>
      <PageHeader
        title="Mis facturas"
        description="Todas las que emitiste, con su estado en ARCA. Las autorizadas se descargan en PDF cuando tus datos para facturas están completos (en Mi cuenta)."
      />
      {hayDePrueba && (
        <p role="note" className="mb-4 rounded-xl border border-warning bg-warning-soft px-4 py-3 text-sm text-strong">
          Las marcadas «de prueba» se autorizaron en el ambiente de prueba de ARCA: no tienen validez fiscal.
        </p>
      )}
      {facturas.length === 0 ? (
        <EmptyState
          title="Todavía no emitiste ninguna"
          description="La primera sale desde la pestaña Emitir."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised shadow-card">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <caption className="sr-only">Facturas emitidas</caption>
            <thead>
              <tr className="border-b border-line bg-surface-sunken text-[11px] font-semibold uppercase tracking-[.06em] text-muted">
                <th scope="col" className="px-[22px] py-[9px]">Fecha</th>
                <th scope="col" className="px-[22px] py-[9px]">Comprobante</th>
                <th scope="col" className="px-[22px] py-[9px]">Estado</th>
                <th scope="col" className="px-[22px] py-[9px] text-right">Total</th>
                <th scope="col" className="px-[22px] py-[9px]"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id} className="border-b border-line-soft align-top last:border-b-0">
                  <td className={`whitespace-nowrap ${CELDA} tabular-nums text-muted`}>{fechaFiscalLegible(f.fecha)}</td>
                  <td className={CELDA}>
                    <span className="block whitespace-nowrap font-mono text-strong">
                      {f.esNotaDeCredito ? "Nota de crédito " : ""}
                      {f.numero ?? "—"}
                    </span>
                    {f.descripcion && <span className="block max-w-xs text-xs text-muted">{f.descripcion}</span>}
                  </td>
                  <td className={CELDA}>
                    {f.status === "AUTHORIZED" ? (
                      f.ambiente === "prueba" ? (
                        <Badge tone="warning" dot>Autorizada de prueba</Badge>
                      ) : f.ambiente === "real" ? (
                        <Badge tone="success" dot>Autorizada</Badge>
                      ) : (
                        <Badge tone="neutral" dot>Autorizada (ambiente sin confirmar)</Badge>
                      )
                    ) : f.status === "REJECTED" ? (
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone="danger" dot>
                          {origenDelRechazo(f.rechazoMotivo) === "arca" ? "Rechazada por ARCA" : "Frenada antes de ARCA"}
                        </Badge>
                        <span className="max-w-xs text-xs text-muted">{motivoLegible(f.rechazoMotivo)}</span>
                      </div>
                    ) : (
                      <Badge tone="neutral" dot>Pendiente</Badge>
                    )}
                    {f.anulacion === "anulada" && (
                      <span className="mt-1 block text-xs text-muted">Anulada con nota de crédito</span>
                    )}
                    {f.anulacion === "en_curso" && (
                      <span className="mt-1 block text-xs text-muted">Anulación en curso: la nota de crédito espera a ARCA</span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap ${CELDA} text-right font-semibold tabular-nums text-strong`}>
                    {fmtMoneyARS(f.total)}
                  </td>
                  <td className={`whitespace-nowrap ${CELDA} text-right`}>
                    <div className="flex flex-col items-end gap-1">
                      {f.status === "AUTHORIZED" && (
                        // Descarga, no navegación: <a> plano (un Link de Next intentaría prefetch de un PDF).
                        <a
                          href={`/facturita/app/facturas/${f.id}/pdf`}
                          className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          aria-label={`Descargar en PDF ${f.esNotaDeCredito ? "la nota de crédito" : "la factura"} ${f.numero ?? ""}`}
                        >
                          PDF
                        </a>
                      )}
                      {/* Montado en toda autorizada (no sólo con saldo): así el aviso de «anulada» sigue en su
                          región viva después de que la lista se actualiza. */}
                      {f.status === "AUTHORIZED" && !f.esNotaDeCredito && (
                        <AnularFactura facturaId={f.id} numero={f.numero ?? ""} anulable={f.saldoAnulable > 0} />
                      )}
                    </div>
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
