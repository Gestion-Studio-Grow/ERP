"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createStockAdjustment } from "@/lib/stock-adjustment-actions";
import { Input, Select, Textarea, buttonClasses } from "@/components/ui";
import {
  ADJUSTMENT_MOTIVOS,
  adjustmentDelta,
  leerValorDeAjuste,
  motivoLabel,
  motivoMode,
  requiresNote,
  type AdjustmentMotivo,
} from "@/lib/stock/adjustment-core";
import { cantidadParaFormulario } from "@/lib/pos-peso";

// Producto ajustable que llega del loader (getAdjustmentData): con stock/unidad actuales.
type AdjustableProduct = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  // false sólo cuando llega preelegido desde el "Recontar" de un producto dado de baja.
  active?: boolean;
};

// Una línea del ajuste en construcción. Se guarda el TEXTO tipeado, no un número: el campo
// es `type="text"` y se lee con `leerValorDeAjuste` (la misma regla que la Server Action).
// Con el `type="number"` de antes, tipear "4,350" entregaba "4350" (medido, ver
// pos-peso.ts) y el recuento dejaba el corte en 4350 kg. El texto se interpreta según el
// motivo (contado / perdido / delta firmado).
type Line = { key: number; productId: string; texto: string };

// Lo que viene preelegido desde otra pantalla (el "Recontar" del catálogo).
export type AjusteInicial = { productId?: string; motivo?: AdjustmentMotivo };

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

export default function AjustesForm({
  products,
  inicial,
}: {
  products: AdjustableProduct[];
  inicial?: AjusteInicial;
}) {
  const [motivo, setMotivo] = useState<AdjustmentMotivo>(inicial?.motivo ?? "RECUENTO");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: 1, productId: inicial?.productId ?? "", texto: "" },
  ]);
  const [nextKey, setNextKey] = useState(2);
  // Foco dirigido (mismo flujo sin-mouse que compras/POS): al elegir producto saltamos
  // al valor; guardamos el id pendiente en un ref para enfocarlo tras el render. Si el
  // producto ya vino elegido (Recontar), se arranca con el foco en el número a cargar.
  const focusRef = useRef<string | null>(inicial?.productId ? "val-1" : null);
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
    setLines((ls) => [...ls, { key, productId: "", texto: "" }]);
    setNextKey((k) => k + 1);
    return key;
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  // Lectura de cada línea con el motivo vigente (cambiar de Recuento a Otro cambia qué
  // significa el mismo texto). Delta = preview con el stock que trajo la pantalla; el
  // autoritativo lo recalcula el core dentro de la transacción con el stock vigente.
  const leidas = lines.map((l) => {
    const p = byId.get(l.productId);
    const lectura = leerValorDeAjuste(mode, l.texto);
    const delta = p && lectura.estado === "ok" ? adjustmentDelta(mode, lectura.valor, p.stock) : 0;
    return { ...l, p, lectura, delta, invalida: !!p && lectura.estado === "invalida" };
  });

  // Una línea ilegible frena TODO el envío, no se descarta: registrar las otras y perder
  // ésa en silencio es cómo un recuento termina a medias sin que nadie lo sepa.
  const hayIlegible = leidas.some((l) => l.invalida);
  const hasValidLine = leidas.some((l) => l.p && l.delta !== 0);
  const canSubmit = hasValidLine && !hayIlegible && (!noteNeeded || note.trim().length > 0);

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
            className={`chip-btn text-sm ${m === motivo ? "bg-accent text-on-accent" : ""}`}
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
              : "Ej.: recuento mensual, cierre de caja"
          }
        />
      </label>

      {/* Líneas del ajuste */}
      <div className="space-y-2 border-t border-line pt-4">
        {leidas.map((l) => {
          const { p, delta } = l;
          return (
            <div key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_120px_auto]">
              <Select
                className="col-span-2 sm:col-span-1"
                id={`prod-${l.key}`}
                aria-label="Producto"
                value={l.productId}
                onChange={(e) => {
                  setLine(l.key, { productId: e.target.value });
                  if (e.target.value) focus(`val-${l.key}`);
                }}
              >
                <option value="">Elegí un producto…</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name}
                    {prod.active === false ? " (inactivo)" : ""} — hay {qtyFmt.format(prod.stock)} {prod.unit}
                  </option>
                ))}
              </Select>
              <div className="relative">
                {/* type="text" + inputMode="decimal": coma y punto valen lo mismo. En OTRO el
                    signo se escribe ("-2,5"); en el resto un "-" se marca como error. */}
                <Input
                  id={`val-${l.key}`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={l.texto}
                  aria-invalid={l.invalida ? true : undefined}
                  aria-label={mode === "COUNT" ? "Cantidad contada" : mode === "LOSS" ? "Cantidad" : "Ajuste (±)"}
                  placeholder={
                    !p
                      ? "—"
                      : mode === "COUNT"
                        ? "Contado"
                        : mode === "LOSS"
                          ? "Cantidad"
                          : "Ajuste ±"
                  }
                  onChange={(e) => setLine(l.key, { texto: e.target.value })}
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
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-lg leading-none text-muted hover:text-danger sm:min-h-9 sm:min-w-9"
                >
                  ×
                </button>
              </div>
              {l.invalida && (
                <p role="alert" className="col-span-2 sm:col-span-3 text-xs text-danger">
                  {mode === "SIGNED"
                    ? "Eso no es un ajuste. Escribí el número con su signo: -2,5 resta, 2,5 suma."
                    : "Eso no es una cantidad. Escribila con coma si tiene gramos (4,350)."}
                </p>
              )}
              {/* Inputs que viajan a la server action (patrón getAll del Core). Viaja la
                  línea sólo si tiene producto y un valor LEGIBLE, en forma canónica (punto
                  decimal): el server la vuelve a leer con la misma regla. El core recalcula
                  el delta y descarta los no-op (recuento que coincide con el sistema). */}
              {p && l.lectura.estado === "ok" && (
                <>
                  <input type="hidden" name="productId" value={l.productId} />
                  <input type="hidden" name="value" value={cantidadParaFormulario(l.lectura.valor)} />
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
