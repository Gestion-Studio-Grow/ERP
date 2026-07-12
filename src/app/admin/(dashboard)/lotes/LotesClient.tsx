"use client";

import { createBatch, setBatchStatus } from "@/lib/carniceria/lotes-actions";
import { Badge, buttonClasses, fmtMoneyARS, type BadgeProps } from "@/components/ui";
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
  if (v.daysToExpiry < 0) return `vencido hace ${Math.abs(v.daysToExpiry)}d`;
  if (v.daysToExpiry === 0) return "vence hoy";
  return `en ${v.daysToExpiry}d`;
}

const STATUS_LABEL: Record<BatchStatus, string> = {
  AVAILABLE: "Disponible",
  DEPLETED: "Agotado",
  EXPIRED: "Vencido",
  WITHDRAWN: "Retirado",
};

const inputClass =
  "rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent";

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warning" | "danger" }) {
  const c = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-strong";
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${c}`}>{value}</p>
    </div>
  );
}

export default function LotesClient({
  views,
  summary,
  products,
  suppliers,
}: {
  views: LoteView[];
  summary: BatchSummary;
  products: Opt[];
  suppliers: Opt[];
}) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Lotes disponibles" value={String(summary.available)} />
        <Kpi label="Kilos al vacío" value={`${summary.totalKg} kg`} />
        <Kpi label="Por vencer (≤3d)" value={String(summary.soon)} tone={summary.soon > 0 ? "warning" : "neutral"} />
        <Kpi label="Vencidos" value={String(summary.expired)} tone={summary.expired > 0 ? "danger" : "neutral"} />
      </div>

      {/* Tabla de lotes (FEFO: el que vence antes, primero) */}
      <section aria-labelledby="lotes-tabla">
        <h2 id="lotes-tabla" className="text-lg font-medium text-strong mb-3">Lotes cargados</h2>
        {views.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay lotes. Cargá el primero abajo.</p>
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
                  <th className="px-4 py-2 font-medium text-right">Acción</th>
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
                        <span className="inline-flex items-center gap-2">
                          <span className="text-body">{v.expiresAtLabel}</span>
                          <Badge tone={EXPIRY_TONE[v.expiryState]}>{expiryLabel(v)}</Badge>
                        </span>
                      ) : (
                        <span className="text-faint">sin fecha</span>
                      )}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5 text-sm tabular-nums text-body">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Peso:</span>
                      {v.netWeightKg != null ? `${v.netWeightKg} kg` : "—"} · {v.packages} paq.
                      {v.avgPackageKg != null && (
                        <span className="block text-xs text-faint">~{v.avgPackageKg} kg/paquete</span>
                      )}
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1 sm:py-2.5">
                      <span className="sm:hidden text-xs uppercase tracking-wide text-faint mr-1.5">Estado:</span>
                      <Badge tone={v.status === "AVAILABLE" ? "success" : "neutral"}>{STATUS_LABEL[v.status]}</Badge>
                    </td>
                    <td className="block sm:table-cell px-0 sm:px-4 py-1.5 sm:py-2.5 sm:text-right whitespace-nowrap">
                      {v.status === "AVAILABLE" ? (
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <form action={setBatchStatus}>
                            <input type="hidden" name="id" value={v.id} />
                            <input type="hidden" name="status" value="DEPLETED" />
                            <button type="submit" className="chip-btn" aria-label={`Marcar lote ${v.code} como agotado`}>Agotado</button>
                          </form>
                          <form action={setBatchStatus}>
                            <input type="hidden" name="id" value={v.id} />
                            <input type="hidden" name="status" value="WITHDRAWN" />
                            <button type="submit" className="chip-btn chip-btn-danger" aria-label={`Retirar lote ${v.code}`}>Retirar</button>
                          </form>
                        </div>
                      ) : (
                        <form action={setBatchStatus} className="sm:text-right">
                          <input type="hidden" name="id" value={v.id} />
                          <input type="hidden" name="status" value="AVAILABLE" />
                          <button type="submit" className="chip-btn" aria-label={`Reactivar lote ${v.code}`}>Reactivar</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Alta de lote */}
      <section className="rounded-lg border border-line bg-surface-sunken p-4">
        <h2 className="text-base font-medium text-strong mb-1">Cargar un lote al vacío</h2>
        <p className="text-sm text-muted mb-4">
          El peso neto y la cantidad de paquetes cubren el <span className="text-body">peso variable</span>: un
          vacío nunca pesa exacto, así que el sistema calcula el promedio por paquete.
        </p>
        <form action={createBatch} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="lote-code" className="text-xs font-medium text-muted">Nº de lote</label>
            <input id="lote-code" name="code" required placeholder="ej: L-2026-014" className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lote-product" className="text-xs font-medium text-muted">Corte</label>
            <select id="lote-product" name="productId" className={inputClass} defaultValue="">
              <option value="">— elegir corte —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lote-supplier" className="text-xs font-medium text-muted">Proveedor</label>
            <select id="lote-supplier" name="supplierId" className={inputClass} defaultValue="">
              <option value="">— opcional —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lote-packed" className="text-xs font-medium text-muted">Fecha de envasado</label>
            <input id="lote-packed" name="packedAt" type="date" className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lote-expires" className="text-xs font-medium text-muted">Vencimiento</label>
            <input id="lote-expires" name="expiresAt" type="date" className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lote-cost" className="text-xs font-medium text-muted">Costo por kilo</label>
            <input id="lote-cost" name="unitCost" type="number" step="1" min="0" inputMode="numeric" placeholder="$/kg" className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lote-weight" className="text-xs font-medium text-muted">Peso neto (kg)</label>
            <input id="lote-weight" name="netWeightKg" type="number" step="0.001" min="0" inputMode="decimal" placeholder="ej: 12,340" className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="lote-packages" className="text-xs font-medium text-muted">Paquetes</label>
            <input id="lote-packages" name="packages" type="number" step="1" min="1" defaultValue={1} inputMode="numeric" className={inputClass} />
          </div>
          <div className="flex items-end">
            <button type="submit" className={buttonClasses("solid", "md", "w-full")}>Cargar lote</button>
          </div>
        </form>
      </section>
    </div>
  );
}
