"use client";

import { useState } from "react";
import { crearLote, cambiarEstadoDelLote, type EstadoLote } from "@/lib/carniceria/lotes-actions";
import { AvisoError, Badge, EmptyState, Input, KpiTile, Select, buttonClasses, fmtMoneyARS, type BadgeProps } from "@/components/ui";
import { useEnvio } from "@/lib/inventario/envio";
import type { ExpiryState, BatchStatus, BatchSummary } from "@/lib/carniceria/lotes";

export interface LoteView {
  id: string;
  code: string;
  productName: string;
  supplierName: string | null;
  packedAtLabel: string | null;
  expiresAtLabel: string | null;
  expiryState: ExpiryState;
  daysToExpiry: number | null;
  netWeightKg: number | null;
  packages: number;
  avgPackageKg: number | null;
  /** Costo por kilo; null sin costo o si quien mira no ve costos. */
  unitCost: number | null;
  status: BatchStatus;
}

type Opt = { id: string; name: string };

const EXPIRY_TONE: Record<ExpiryState, BadgeProps["tone"]> = {
  none: "neutral",
  ok: "success",
  soon: "warning",
  expired: "danger",
};

function expiryLabel(v: LoteView): string {
  if (v.expiryState === "none") return "sin fecha";
  if (v.daysToExpiry === null) return "—";
  if (v.daysToExpiry < 0) return `vencido hace ${Math.abs(v.daysToExpiry)} d`;
  if (v.daysToExpiry === 0) return "vence hoy";
  if (v.daysToExpiry === 1) return "vence mañana";
  return `en ${v.daysToExpiry} d`;
}

const STATUS_LABEL: Record<BatchStatus, string> = {
  AVAILABLE: "Disponible",
  DEPLETED: "Agotado",
  EXPIRED: "Vencido",
  WITHDRAWN: "Retirado",
};

const kgFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

// Cambiar el estado de un lote: una acción por botón, con su error a la vista (antes, si
// fallaba, no pasaba nada y no se decía nada).
function CambiarEstado({ id, code, status }: { id: string; code: string; status: BatchStatus }) {
  const { estado, enviar, enviando } = useEnvio<EstadoLote>(cambiarEstadoDelLote, null);
  const boton = (hacia: BatchStatus, texto: string, aria: string, peligro = false) => (
    <form onSubmit={enviar}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={hacia} />
      <button
        type="submit"
        disabled={enviando}
        className={`chip-btn max-sm:min-h-11! min-h-11 ${peligro ? "chip-btn-danger" : ""} disabled:opacity-50`}
        aria-label={aria}
      >
        {texto}
      </button>
    </form>
  );
  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {status === "AVAILABLE" ? (
          <>
            {boton("DEPLETED", "Agotado", `Marcar el lote ${code} como agotado`)}
            {boton("WITHDRAWN", "Retirar", `Retirar el lote ${code}`, true)}
          </>
        ) : (
          boton("AVAILABLE", "Reactivar", `Volver a poner disponible el lote ${code}`)
        )}
      </div>
      {estado?.ok === false && (
        <p role="alert" className="text-xs text-danger">
          {estado.error}
        </p>
      )}
    </div>
  );
}

export default function LotesClient({
  views,
  summary,
  riesgo,
  products,
  suppliers,
  conCostos,
  puedeCargar,
}: {
  views: LoteView[];
  summary: BatchSummary;
  /** La plata en riesgo (sólo con costos): lotes que vencen en 3 días o menos. */
  riesgo: { lotes: number; pesos: number; sinCosto: number } | null;
  products: Opt[];
  suppliers: Opt[];
  conCostos: boolean;
  puedeCargar: boolean;
}) {
  // Vuelta de cada alta que salió bien: re-monta los campos para que queden vacíos. Si volvió
  // con error, queda todo como estaba (useEnvio no vacía el formulario).
  const [vuelta, setVuelta] = useState(0);
  const { estado, enviar, enviando } = useEnvio<EstadoLote>(async (prev, fd) => {
    const r = await crearLote(prev, fd);
    if (r?.ok) setVuelta((v) => v + 1);
    return r;
  }, null);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Lotes disponibles" value={summary.available} />
        <KpiTile label="Kilos al vacío" value={`${kgFmt.format(summary.totalKg)} kg`} />
        <KpiTile
          label="Vencen en 3 días o menos"
          value={<span className={summary.soon > 0 ? "text-warning" : undefined}>{summary.soon}</span>}
          sub={riesgo && riesgo.lotes > 0 ? `${fmtMoneyARS(riesgo.pesos, 0)} en riesgo${riesgo.sinCosto > 0 ? ` · ${riesgo.sinCosto} sin costo` : ""}` : undefined}
        />
        <KpiTile
          label="Vencidos en la heladera"
          value={<span className={summary.expired > 0 ? "text-danger" : undefined}>{summary.expired}</span>}
          sub={summary.expired > 0 ? "Sacalos y cargá la merma" : undefined}
        />
      </div>

      {/* Tabla de lotes (FEFO: el que vence antes, primero) */}
      <section aria-labelledby="lotes-tabla">
        <h2 id="lotes-tabla" className="text-lg font-medium text-strong mb-3">Lotes cargados</h2>
        {views.length === 0 ? (
          <EmptyState
            title="Todavía no hay lotes"
            description={
              puedeCargar
                ? "Cargá cada lote al vacío con su vencimiento cuando llega: acá se ordenan por el que vence antes."
                : "Los lotes los carga quien recibe la mercadería. Cuando haya, se ordenan acá por el que vence antes."
            }
            action={
              puedeCargar ? (
                // El alta está abajo (en el celular, fuera de la pantalla): el foco lleva hasta ahí.
                <button type="button" onClick={() => document.getElementById("lote-code")?.focus()} className={buttonClasses("solid", "md")}>
                  Cargar el primero
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
            <table className="block sm:table w-full text-left">
              <thead className="hidden sm:table-header-group">
                <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2 font-medium">Lote</th>
                  <th className="px-4 py-2 font-medium">Corte</th>
                  <th className="px-4 py-2 font-medium">Envasado</th>
                  <th className="px-4 py-2 font-medium">Vence</th>
                  <th className="px-4 py-2 font-medium">Peso / paquetes</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  {puedeCargar && <th className="px-4 py-2 font-medium text-right">Acción</th>}
                </tr>
              </thead>
              <tbody className="block sm:table-row-group">
                {views.map((v) => (
                  <tr key={v.id} className="block sm:table-row rounded-lg border sm:border-0 sm:border-b sm:rounded-none sm:last:border-b-0 mb-3 sm:mb-0 px-3 py-2.5 sm:px-0 sm:py-0">
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm font-medium text-strong">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Lote:</span>
                      {v.code}
                      {v.supplierName && <span className="block text-xs text-faint">{v.supplierName}</span>}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-body">{v.productName}</td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm text-body">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Envasado:</span>
                      {v.packedAtLabel ?? "—"}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Vence:</span>
                      {v.expiresAtLabel ? (
                        <span className="inline-flex flex-wrap items-center gap-2">
                          <span className="text-body">{v.expiresAtLabel}</span>
                          {v.status === "AVAILABLE" && <Badge tone={EXPIRY_TONE[v.expiryState]}>{expiryLabel(v)}</Badge>}
                        </span>
                      ) : (
                        <span className="text-faint">sin fecha</span>
                      )}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums text-body">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Peso:</span>
                      {v.netWeightKg != null ? `${kgFmt.format(v.netWeightKg)} kg` : "—"} · {v.packages} paq.
                      {v.avgPackageKg != null && (
                        <span className="block text-xs text-faint">~{kgFmt.format(v.avgPackageKg)} kg por paquete</span>
                      )}
                      {conCostos && v.unitCost != null && (
                        <span className="block text-xs text-faint">{fmtMoneyARS(v.unitCost)} el kilo</span>
                      )}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Estado:</span>
                      <Badge tone={v.status === "AVAILABLE" ? "success" : "neutral"}>{STATUS_LABEL[v.status]}</Badge>
                    </td>
                    {puedeCargar && (
                      <td className="block sm:table-cell px-0 sm:px-4 py-1.5 sm:py-2.5 sm:text-right">
                        <CambiarEstado id={v.id} code={v.code} status={v.status} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Alta de lote */}
      {puedeCargar && (
        <section className="rounded-lg border border-line bg-surface-sunken p-4">
          <h2 className="text-base font-medium text-strong mb-1">Cargar un lote al vacío</h2>
          <p className="text-sm text-muted mb-4">
            El peso neto y la cantidad de paquetes cubren el <span className="text-body">peso variable</span>: un vacío
            nunca pesa exacto, así que el sistema calcula el promedio por paquete. Las fechas son las de la etiqueta.
          </p>
          {estado?.ok === false && <AvisoError titulo="No se cargó el lote" comoSeguir={estado.error} />}
          {estado?.ok && (
            <p role="status" className="mb-3 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-strong">
              {estado.mensaje}
            </p>
          )}
          <form key={vuelta} onSubmit={enviar} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="lote-code" className="text-xs font-medium text-muted">Nº de lote</label>
              <Input id="lote-code" name="code" required maxLength={40} autoComplete="off" placeholder="ej: L-2026-014" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lote-product" className="text-xs font-medium text-muted">Corte</label>
              <Select id="lote-product" name="productId" required defaultValue="">
                <option value="">Elegí el corte…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lote-supplier" className="text-xs font-medium text-muted">Proveedor (opcional)</label>
              <Select id="lote-supplier" name="supplierId" defaultValue="">
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lote-packed" className="text-xs font-medium text-muted">Fecha de envasado (opcional)</label>
              <Input id="lote-packed" name="packedAt" type="date" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lote-expires" className="text-xs font-medium text-muted">Vencimiento</label>
              <Input id="lote-expires" name="expiresAt" type="date" required />
            </div>
            {conCostos && (
              <div className="flex flex-col gap-1">
                <label htmlFor="lote-cost" className="text-xs font-medium text-muted">Costo por kilo (opcional)</label>
                <Input id="lote-cost" name="unitCost" type="text" inputMode="decimal" autoComplete="off" placeholder="$ el kilo" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="lote-weight" className="text-xs font-medium text-muted">Peso neto en kg (opcional)</label>
              <Input id="lote-weight" name="netWeightKg" type="text" inputMode="decimal" autoComplete="off" placeholder="ej: 12,340" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lote-packages" className="text-xs font-medium text-muted">Paquetes</label>
              <Input id="lote-packages" name="packages" type="text" inputMode="numeric" autoComplete="off" defaultValue="1" />
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={enviando} className={buttonClasses("solid", "md", "w-full disabled:opacity-50")}>
                {enviando ? "Cargando…" : "Cargar lote"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
