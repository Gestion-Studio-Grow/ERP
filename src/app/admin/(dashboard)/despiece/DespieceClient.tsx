"use client";

import { useMemo, useState } from "react";
import { createRun } from "@/lib/carniceria/despiece-actions";
import { analyzeDespiece } from "@/lib/carniceria/despiece";
import { Badge, buttonClasses, fmtMoneyARS } from "@/components/ui";

export interface RunView {
  id: string;
  code: number;
  inputName: string;
  inputWeightKg: number;
  inputCost: number;
  totalOutputKg: number;
  mermaKg: number;
  mermaPct: number;
  costPerSellableKg: number | null;
  createdAtLabel: string;
  outputs: { name: string; weightKg: number }[];
}

type Opt = { id: string; name: string };
type OutRow = { name: string; weight: string; productId: string };

const inputClass =
  "rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function DespieceClient({ runs, products }: { runs: RunView[]; products: Opt[] }) {
  const [inputName, setInputName] = useState("");
  const [inputWeight, setInputWeight] = useState("");
  const [inputCost, setInputCost] = useState("");
  const [rows, setRows] = useState<OutRow[]>([
    { name: "", weight: "", productId: "" },
    { name: "", weight: "", productId: "" },
  ]);

  const setRow = (i: number, patch: Partial<OutRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { name: "", weight: "", productId: "" }]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  // Cuando se elige un producto, autocompleta el nombre del corte si está vacío.
  const onPickProduct = (i: number, id: string) => {
    const name = products.find((p) => p.id === id)?.name ?? "";
    setRow(i, { productId: id, name: rows[i].name || name });
  };

  // Preview EN VIVO (misma lógica pura que valida el server al registrar).
  const preview = useMemo(() => {
    const iw = Number(inputWeight);
    const ic = Number(inputCost) || 0;
    if (!Number.isFinite(iw) || iw <= 0) return null;
    const outputs = rows
      .map((r) => ({ name: r.name.trim(), weightKg: Number(r.weight) }))
      .filter((o) => o.name && Number.isFinite(o.weightKg) && o.weightKg > 0);
    if (outputs.length === 0) return null;
    return analyzeDespiece({ inputWeightKg: iw, inputCost: ic, outputs });
  }, [inputWeight, inputCost, rows]);

  return (
    <div className="space-y-10">
      {/* Alta de despiece */}
      <form action={createRun} className="space-y-5">
        <section className="rounded-lg border border-line bg-surface-sunken p-4">
          <h2 className="text-base font-medium text-strong mb-3">Entrada (media res / cuarto / pieza)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-1">
              <label htmlFor="d-inputName" className="text-xs font-medium text-muted">Qué entró</label>
              <input id="d-inputName" name="inputName" required value={inputName} onChange={(e) => setInputName(e.target.value)} placeholder="ej: Media res novillo" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="d-inputWeight" className="text-xs font-medium text-muted">Peso de entrada (kg)</label>
              <input id="d-inputWeight" name="inputWeightKg" type="number" step="0.001" min="0" required inputMode="decimal" value={inputWeight} onChange={(e) => setInputWeight(e.target.value)} placeholder="ej: 120" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="d-inputCost" className="text-xs font-medium text-muted">Costo total ($)</label>
              <input id="d-inputCost" name="inputCost" type="number" step="1" min="0" inputMode="numeric" value={inputCost} onChange={(e) => setInputCost(e.target.value)} placeholder="ej: 900000" className={inputClass} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-line p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-medium text-strong">Cortes obtenidos</h2>
            <button type="button" onClick={addRow} className="chip-btn">+ Agregar corte</button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px_auto] gap-2 items-end">
                <div className="flex flex-col gap-1">
                  {i === 0 && <label className="text-xs font-medium text-muted">Corte (mapeá a un producto para sumar stock)</label>}
                  <select value={r.productId} name="outputProductId" onChange={(e) => onPickProduct(i, e.target.value)} className={inputClass} aria-label="Producto del corte">
                    <option value="">— sin producto —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  {i === 0 && <label className="text-xs font-medium text-muted">Nombre</label>}
                  <input name="outputName" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="ej: Asado de tira" className={inputClass} aria-label="Nombre del corte" />
                </div>
                <div className="flex flex-col gap-1">
                  {i === 0 && <label className="text-xs font-medium text-muted">Kilos</label>}
                  <input name="outputWeight" type="number" step="0.001" min="0" inputMode="decimal" value={r.weight} onChange={(e) => setRow(i, { weight: e.target.value })} placeholder="kg" className={inputClass} aria-label="Kilos del corte" />
                </div>
                <button type="button" onClick={() => removeRow(i)} className="chip-btn chip-btn-danger h-[34px]" aria-label={`Quitar corte ${i + 1}`}>Quitar</button>
              </div>
            ))}
          </div>
        </section>

        {/* Preview en vivo */}
        {preview && (
          <section aria-live="polite" className="rounded-lg border border-line bg-surface-raised p-4">
            <h3 className="text-sm font-medium text-strong mb-3">Vista previa</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div><p className="text-xs text-muted">Kilos obtenidos</p><p className="text-lg font-semibold tabular-nums text-strong">{preview.totalOutputKg} kg</p></div>
              <div>
                <p className="text-xs text-muted">Merma</p>
                <p className={`text-lg font-semibold tabular-nums ${preview.overDeclared ? "text-danger" : "text-warning"}`}>
                  {preview.mermaKg} kg <span className="text-sm">({pct(preview.mermaPct)})</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Costo por kilo vendible</p>
                <p className="text-lg font-semibold tabular-nums text-strong">{preview.costPerSellableKg != null ? fmtMoneyARS(preview.costPerSellableKg) : "—"}</p>
              </div>
              <div className="flex items-end">
                {preview.overDeclared && <Badge tone="danger">Declaraste más kilos que la entrada</Badge>}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted">
                    <th className="py-1.5 pr-4 font-medium">Corte</th>
                    <th className="py-1.5 pr-4 font-medium">Kilos</th>
                    <th className="py-1.5 pr-4 font-medium">Rendimiento</th>
                    <th className="py-1.5 pr-4 font-medium text-right">Costo asignado</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.outputs.map((o, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-4 text-body">{o.name}</td>
                      <td className="py-1.5 pr-4 tabular-nums text-body">{o.weightKg} kg</td>
                      <td className="py-1.5 pr-4 tabular-nums text-body">{pct(o.yieldPct)}</td>
                      <td className="py-1.5 pr-4 tabular-nums text-body text-right">{o.costShare != null ? fmtMoneyARS(o.costShare) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div>
          <button type="submit" className={buttonClasses("solid", "md")}>Registrar despiece</button>
          <p className="mt-2 text-xs text-muted">
            Al registrar: se guarda el despiece, se suma el stock de cada corte mapeado a un producto y se
            fija su costo real por kilo (el de esta corrida).
          </p>
        </div>
      </form>

      {/* Historial */}
      <section aria-labelledby="despiece-hist">
        <h2 id="despiece-hist" className="text-lg font-medium text-strong mb-3">Despieces registrados</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">Todavía no registraste ningún despiece.</p>
        ) : (
          <div className="space-y-3">
            {runs.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div>
                    <span className="text-sm font-semibold text-strong">#{r.code} · {r.inputName}</span>
                    <span className="ml-2 text-xs text-faint">{r.createdAtLabel}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm tabular-nums">
                    <span className="text-muted">{r.inputWeightKg} kg →</span>
                    <span className="text-body">{r.totalOutputKg} kg</span>
                    <Badge tone={r.mermaKg < 0 ? "danger" : "warning"}>merma {r.mermaKg} kg ({pct(r.mermaPct)})</Badge>
                    {r.costPerSellableKg != null && <Badge tone="neutral">{fmtMoneyARS(r.costPerSellableKg)}/kg</Badge>}
                  </div>
                </div>
                <p className="text-xs text-muted">
                  {r.outputs.map((o) => `${o.name} ${o.weightKg}kg`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
