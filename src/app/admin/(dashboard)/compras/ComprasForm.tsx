"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createStockPurchase } from "@/lib/stock-actions";
import { Input, Select, buttonClasses } from "@/components/ui";

// Producto reponible que llega del loader (getStockData): con stock/unidad actuales.
type ReplenishableProduct = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockAt: number;
};

// Una línea de la entrada en construcción. `qty` es cantidad a ingresar (en la unidad
// del producto); `unitCost` es el costo de compra unitario (opcional en reposición).
type Line = { key: number; productId: string; qty: number; unitCost: number };

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

export default function ComprasForm({ products }: { products: ReplenishableProduct[] }) {
  const [kind, setKind] = useState<"COMPRA" | "REPOSICION">("COMPRA");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qty: 0, unitCost: 0 }]);
  const [nextKey, setNextKey] = useState(2);
  // Foco dirigido: al elegir producto saltamos a la cantidad; con Enter, al próximo
  // producto (mismo flujo sin-mouse que el POS de venta). Guardamos el id pendiente
  // en un ref (no en state) para poder enfocarlo tras el render sin setState-en-effect.
  const focusRef = useRef<string | null>(null);
  const focus = (id: string) => {
    focusRef.current = id;
  };

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const isCompra = kind === "COMPRA";

  // Tras cada render, si hay un foco pendiente lo aplicamos y limpiamos el ref
  // (mutar un ref no dispara re-render, así que no hay cascada).
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
    setLines((ls) => [...ls, { key, productId: "", qty: 0, unitCost: 0 }]);
    setNextKey((k) => k + 1);
    return key;
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  const totalCost = lines.reduce((s, l) => {
    if (!byId.get(l.productId) || !(l.qty > 0) || !(l.unitCost > 0)) return s;
    return s + l.qty * l.unitCost;
  }, 0);
  const hasValidLine = lines.some((l) => byId.get(l.productId) && l.qty > 0);

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-muted">
        No hay productos cargados todavía. Cargá los productos en el catálogo para poder
        registrar compras y reponer su stock.
      </div>
    );
  }

  return (
    <form action={createStockPurchase} className="rounded-lg border border-line p-4 space-y-4">
      {/* El hidden refleja el toggle de tipo. */}
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setKind("COMPRA")}
          className={`chip-btn text-sm ${isCompra ? "bg-accent text-on-accent" : ""}`}
        >
          Compra a proveedor
        </button>
        <button
          type="button"
          onClick={() => setKind("REPOSICION")}
          className={`chip-btn text-sm ${!isCompra ? "bg-accent text-on-accent" : ""}`}
        >
          Reposición / ajuste
        </button>
        <span className="text-xs text-faint">
          {isCompra
            ? "Ingreso de mercadería con costo. Suma stock y registra el costo de compra."
            : "Reposición interna (recuento, devolución). Suma stock; el costo es opcional."}
        </span>
      </div>

      {/* Cabecera del documento */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-muted mb-1">Proveedor {isCompra ? "" : "(opcional)"}</span>
          <Input name="supplier" placeholder="Nombre del proveedor o remito" />
        </label>
        <label className="text-sm">
          <span className="block text-muted mb-1">Nota</span>
          <Input name="notes" placeholder="ej: remito 0001-00042, entrega parcial" />
        </label>
      </div>

      {/* Líneas de la entrada */}
      <div className="space-y-2 border-t border-line pt-4">
        {lines.map((l) => {
          const p = byId.get(l.productId);
          const lineTotal = p && l.qty > 0 && l.unitCost > 0 ? l.qty * l.unitCost : 0;
          return (
            <div key={l.key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[1fr_110px_130px_auto]">
              <Select
                className="col-span-3 sm:col-span-1"
                id={`prod-${l.key}`}
                value={l.productId}
                onChange={(e) => {
                  setLine(l.key, { productId: e.target.value });
                  if (e.target.value) focus(`qty-${l.key}`);
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
                  id={`qty-${l.key}`}
                  type="number"
                  min="0"
                  step="0.001"
                  value={l.qty || ""}
                  placeholder={p ? "Cantidad" : "—"}
                  onChange={(e) => setLine(l.key, { qty: Number(e.target.value) })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      focus(`cost-${l.key}`);
                    }
                  }}
                  disabled={!p}
                  className="pr-8 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  {p ? p.unit.slice(0, 3) : ""}
                </span>
              </div>
              <div className="relative">
                <Input
                  id={`cost-${l.key}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.unitCost || ""}
                  placeholder={isCompra ? "Costo u." : "Costo (opt)"}
                  onChange={(e) => setLine(l.key, { unitCost: Number(e.target.value) })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (l.qty > 0) focus(`prod-${addLine()}`);
                    }
                  }}
                  disabled={!p}
                  className="pr-6 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  $
                </span>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="w-24 text-right text-sm tabular-nums text-body">
                  {lineTotal > 0 ? money.format(lineTotal) : "—"}
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
              {/* Inputs que viajan a la server action (patrón getAll del Core). La
                  cantidad SIEMPRE viaja si hay producto y cantidad; el costo viaja
                  en paralelo para no desalinear los arrays (vacío → 0 en la acción). */}
              {p && l.qty > 0 && (
                <>
                  <input type="hidden" name="productId" value={l.productId} />
                  <input type="hidden" name="quantity" value={l.qty} />
                  <input type="hidden" name="unitCost" value={l.unitCost || ""} />
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
        <div className="text-sm text-muted">
          Costo total{" "}
          <span className="ml-1 text-2xl font-semibold tabular-nums text-strong">
            {money.format(totalCost)}
          </span>
        </div>
        <button type="submit" disabled={!hasValidLine} className={buttonClasses("solid", "lg")}>
          Registrar {isCompra ? "compra" : "reposición"}
        </button>
      </div>
    </form>
  );
}
