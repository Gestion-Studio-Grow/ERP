"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createStockAdjustment } from "@/lib/stock-adjustment-actions";
import { Input, Select, Textarea, buttonClasses } from "@/components/ui";
import {
  ADJUSTMENT_MOTIVOS,
  adjustmentDelta,
  motivoLabel,
  motivoMode,
  requiresNote,
  type AdjustmentMotivo,
} from "@/lib/stock/adjustment-core";

// Producto ajustable que llega del loader (getAdjustmentData): con stock/unidad actuales.
type AdjustableProduct = {
  id: string;
  name: string;
  unit: string;
  stock: number;
};

// Una línea del ajuste en construcción. `value` se interpreta según el motivo
// (contado / perdido / delta firmado) — la misma regla que el core.
type Line = { key: number; productId: string; value: number; touched: boolean };

const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
const signedFmt = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 3,
  signDisplay: "always",
});

// Texto de ayuda por motivo: qué significa el número que se carga.
const MODE_HINT: Record<AdjustmentMotivo, string> = {
  RECUENTO: "Cargá el stock REAL contado de cada producto. El sistema calcula la diferencia.",
  MERMA: "Cargá la cantidad perdida de cada producto. Siempre resta del stock.",
  ROTURA: "Cargá la cantidad rota de cada producto. Siempre resta del stock.",
  VENCIMIENTO: "Cargá la cantidad vencida de cada producto. Siempre resta del stock.",
  OTRO: "Cargá el ajuste con signo (+ suma, − resta). Requiere una nota que lo explique.",
};

export default function AjustesForm({ products }: { products: AdjustableProduct[] }) {
  const [motivo, setMotivo] = useState<AdjustmentMotivo>("RECUENTO");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: 1, productId: "", value: 0, touched: false },
  ]);
  const [nextKey, setNextKey] = useState(2);
  // Foco dirigido (mismo flujo sin-mouse que compras/POS): al elegir producto saltamos
  // al valor; guardamos el id pendiente en un ref para enfocarlo tras el render.
  const focusRef = useRef<string | null>(null);
  const focus = (id: string) => {
    focusRef.current = id;
  };

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const mode = motivoMode(motivo);
  const noteNeeded = requiresNote(motivo);

  useEffect(() => {
    if (!focusRef.current) return;
    document.getElementById(focusRef.current)?.focus();
    focusRef.current = null;
  });

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    const key = nextKey;
    setLines((ls) => [...ls, { key, productId: "", value: 0, touched: false }]);
    setNextKey((k) => k + 1);
    return key;
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  // Delta de una línea (preview): usa el stock que trajo la pantalla. El autoritativo
  // lo recalcula el core dentro de la transacción con el stock vigente.
  function lineDelta(l: Line): number {
    const p = byId.get(l.productId);
    if (!p || !l.touched) return 0;
    return adjustmentDelta(mode, l.value, p.stock);
  }

  const hasValidLine = lines.some((l) => byId.get(l.productId) && lineDelta(l) !== 0);
  const canSubmit = hasValidLine && (!noteNeeded || note.trim().length > 0);

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-muted">
        No hay productos cargados todavía. Cargá los productos en el catálogo para poder
        ajustar su stock.
      </div>
    );
  }

  return (
    <form action={createStockAdjustment} className="rounded-lg border border-line p-4 space-y-4">
      <input type="hidden" name="motivo" value={motivo} />

      {/* Motivo del ajuste */}
      <div className="flex flex-wrap items-center gap-2">
        {ADJUSTMENT_MOTIVOS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            className={`chip-btn text-sm ${m === motivo ? "bg-black text-white" : ""}`}
          >
            {motivoLabel(m)}
          </button>
        ))}
      </div>
      <p className="text-xs text-faint">{MODE_HINT[motivo]}</p>

      {/* Nota (obligatoria en OTRO) */}
      <label className="block text-sm">
        <span className="block text-muted mb-1">
          Nota {noteNeeded ? <span className="text-danger">(obligatoria)</span> : "(opcional)"}
        </span>
        <Textarea
          name="note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            noteNeeded
              ? "Explicá el motivo del ajuste"
              : "ej: recuento mensual, cierre de caja"
          }
        />
      </label>

      {/* Líneas del ajuste */}
      <div className="space-y-2 border-t border-line pt-4">
        {lines.map((l) => {
          const p = byId.get(l.productId);
          const delta = lineDelta(l);
          return (
            <div key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_120px_auto]">
              <Select
                className="col-span-2 sm:col-span-1"
                id={`prod-${l.key}`}
                value={l.productId}
                onChange={(e) => {
                  setLine(l.key, { productId: e.target.value });
                  if (e.target.value) focus(`val-${l.key}`);
                }}
              >
                <option value="">Elegí un producto…</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name} — hay {qtyFmt.format(prod.stock)} {prod.unit}
                  </option>
                ))}
              </Select>
              <div className="relative">
                <Input
                  id={`val-${l.key}`}
                  type="number"
                  // OTRO admite negativos (delta firmado); el resto sólo magnitudes ≥ 0.
                  min={mode === "SIGNED" ? undefined : "0"}
                  step="0.001"
                  value={l.touched ? l.value || "" : ""}
                  placeholder={
                    !p
                      ? "—"
                      : mode === "COUNT"
                        ? "Contado"
                        : mode === "LOSS"
                          ? "Cantidad"
                          : "Ajuste ±"
                  }
                  onChange={(e) => setLine(l.key, { value: Number(e.target.value), touched: true })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (delta !== 0) focus(`prod-${addLine()}`);
                    }
                  }}
                  disabled={!p}
                  className="pr-8 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  {p ? p.unit.slice(0, 3) : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span
                  className={`w-28 text-right text-sm tabular-nums ${
                    delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-faint"
                  }`}
                >
                  {p && delta !== 0
                    ? `${signedFmt.format(delta)} → ${qtyFmt.format(p.stock + delta)}`
                    : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(l.key)}
                  aria-label="Quitar línea"
                  className="text-lg leading-none text-muted px-1 hover:text-danger"
                >
                  ×
                </button>
              </div>
              {/* Inputs que viajan a la server action (patrón getAll del Core). Viaja la
                  línea sólo si tiene producto y un valor cargado; el core recalcula el
                  delta y descarta los no-op (recuento que coincide con el sistema). */}
              {p && l.touched && Number.isFinite(l.value) && (
                <>
                  <input type="hidden" name="productId" value={l.productId} />
                  <input type="hidden" name="value" value={l.value} />
                </>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => focus(`prod-${addLine()}`)}
          className="chip-btn text-sm"
        >
          + Agregar producto
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <p className="text-xs text-faint max-w-xs">
          Cada línea queda registrada en el historial de stock con su motivo.
        </p>
        <button type="submit" disabled={!canSubmit} className={buttonClasses("solid", "lg")}>
          Registrar ajuste
        </button>
      </div>
    </form>
  );
}
