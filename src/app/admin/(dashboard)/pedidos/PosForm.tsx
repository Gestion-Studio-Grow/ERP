"use client";

import { useEffect, useMemo, useState } from "react";
import { createOrder } from "@/lib/order-actions";
import { Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";

// Producto vendible que llega del loader (getPosData): ya viene con precio.
type SellableProduct = {
  id: string;
  name: string;
  saleUnit: "UNIT" | "WEIGHT";
  price: number | null;
  pricePerKg: number | null;
  unit: string;
};

// Una línea del ticket en construcción. `qty` son kilos (WEIGHT) o unidades (UNIT).
type Line = { key: number; productId: string; qty: number };


function unitPriceOf(p: SellableProduct): number {
  return (p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0;
}

export default function PosForm({ products }: { products: SellableProduct[] }) {
  // Caja de mostrador (venta rápida, se cobra en el acto) vs. pedido con retiro/envío.
  const [isOrder, setIsOrder] = useState(false);
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qty: 0 }]);
  const [nextKey, setNextKey] = useState(2);
  // Foco dirigido: al elegir un producto saltamos a pesar/contar; con Enter saltamos
  // al próximo producto. Es lo que hace fluida la atención en mostrador (sin mouse).
  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget(null);
  }, [focusTarget]);

  function setLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine() {
    const key = nextKey;
    setLines((ls) => [...ls, { key, productId: "", qty: 0 }]);
    setNextKey((k) => k + 1);
    return key;
  }
  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  const subtotal = lines.reduce((s, l) => {
    const p = byId.get(l.productId);
    if (!p || !(l.qty > 0)) return s;
    return s + l.qty * unitPriceOf(p);
  }, 0);

  const hasValidLine = lines.some((l) => byId.get(l.productId) && l.qty > 0);

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-muted">
        No hay productos con precio cargado todavía. Cargá los cortes con precio (por kg o por
        unidad) en el catálogo para poder venderlos en la caja.
      </div>
    );
  }

  return (
    <form action={createOrder} className="rounded-lg border border-line p-4 space-y-4">
      {/* Canal: el hidden refleja el toggle de modo. */}
      <input type="hidden" name="channel" value={isOrder ? "ONLINE" : "COUNTER"} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOrder(false)}
          className={`chip-btn text-sm ${!isOrder ? "bg-accent text-on-accent" : ""}`}
        >
          Caja / mostrador
        </button>
        <button
          type="button"
          onClick={() => setIsOrder(true)}
          className={`chip-btn text-sm ${isOrder ? "bg-accent text-on-accent" : ""}`}
        >
          Pedido (retiro / envío)
        </button>
        {!isOrder && (
          <span className="text-xs text-faint">
            Elegí el producto, pesá o contá, y cobrá. Enter salta al siguiente.
          </span>
        )}
      </div>

      {/* Ticket: líneas de venta */}
      <div className="space-y-2">
        {lines.map((l) => {
          const p = byId.get(l.productId);
          const isWeight = p?.saleUnit === "WEIGHT";
          const lineTotal = p && l.qty > 0 ? l.qty * unitPriceOf(p) : 0;
          return (
            <div key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_128px_auto]">
              <Select
                className="col-span-2 sm:col-span-1"
                id={`prod-${l.key}`}
                aria-label="Producto"
                value={l.productId}
                onChange={(e) => {
                  setLine(l.key, { productId: e.target.value, qty: 0 });
                  if (e.target.value) setFocusTarget(`qty-${l.key}`); // saltar a pesar/contar
                }}
              >
                <option value="">Elegí un producto…</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name} —{" "}
                    {prod.saleUnit === "WEIGHT"
                      ? `${fmtMoneyARS(prod.pricePerKg ?? 0)}/kg`
                      : `${fmtMoneyARS(prod.price ?? 0)}/u`}
                  </option>
                ))}
              </Select>
              <div className="relative">
                <Input
                  id={`qty-${l.key}`}
                  type="number"
                  min="0"
                  step={isWeight ? "0.01" : "1"}
                  value={l.qty || ""}
                  aria-label={isWeight ? "Peso en kg" : "Cantidad"}
                  placeholder={p ? (isWeight ? "Peso" : "Cantidad") : "—"}
                  onChange={(e) => setLine(l.key, { qty: Number(e.target.value) })}
                  onKeyDown={(e) => {
                    // Enter = cerrar esta línea y saltar al próximo producto (flujo de caja).
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (l.qty > 0) setFocusTarget(`prod-${addLine()}`);
                    }
                  }}
                  disabled={!p}
                  className="pr-8 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  {p ? (isWeight ? "kg" : "u") : ""}
                </span>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="w-24 text-right text-sm tabular-nums text-body">
                  {lineTotal > 0 ? fmtMoneyARS(lineTotal) : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(l.key)}
                  aria-label="Quitar línea"
                  className="inline-flex items-center justify-center min-h-6 min-w-6 text-lg leading-none text-muted px-1 hover:text-danger"
                >
                  ×
                </button>
              </div>
              {/* Inputs que viajan a la server action (mismo patrón getAll del Core) */}
              {p && l.qty > 0 && (
                <>
                  <input type="hidden" name="productId" value={l.productId} />
                  <input type="hidden" name="quantity" value={l.qty} />
                </>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setFocusTarget(`prod-${addLine()}`)} className="chip-btn text-sm">
          + Agregar producto
        </button>
      </div>

      {/* Datos del pedido (solo en modo pedido con retiro/envío) */}
      {isOrder && (
        <div className="grid gap-3 sm:grid-cols-2 border-t border-line pt-4">
          <label className="text-sm">
            <span className="block text-muted mb-1">Cliente *</span>
            <Input name="customerName" required={isOrder} placeholder="Nombre y apellido" />
          </label>
          <label className="text-sm">
            <span className="block text-muted mb-1">Teléfono / WhatsApp</span>
            <Input name="customerPhone" placeholder="11…" />
          </label>
          <label className="text-sm">
            <span className="block text-muted mb-1">Entrega</span>
            <Select
              name="fulfillment"
              value={fulfillment}
              onChange={(e) => setFulfillment(e.target.value as "PICKUP" | "DELIVERY")}
            >
              <option value="PICKUP">Retira en el local</option>
              <option value="DELIVERY">Envío a domicilio</option>
            </Select>
          </label>
          <label className="text-sm">
            <span className="block text-muted mb-1">Horario deseado</span>
            <Input name="scheduledFor" type="datetime-local" />
          </label>
          {fulfillment === "DELIVERY" && (
            <label className="text-sm sm:col-span-2">
              <span className="block text-muted mb-1">Dirección *</span>
              <Input name="address" required={fulfillment === "DELIVERY"} placeholder="Calle, número, barrio" />
            </label>
          )}
          <label className="text-sm sm:col-span-2">
            <span className="block text-muted mb-1">Nota</span>
            <Input name="notes" placeholder="Ej.: cortar en milanesas, sin grasa" />
          </label>
        </div>
      )}

      {/* Cobro (la venta de mostrador se cobra en el acto) */}
      <div className="grid gap-3 sm:grid-cols-2 border-t border-line pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="paid" defaultChecked={!isOrder} />
          <span className="text-body">Cobrado</span>
        </label>
        <label className="text-sm">
          <span className="block text-muted mb-1">Medio de pago</span>
          <Select name="paymentMethod" defaultValue="EFECTIVO">
            <option value="EFECTIVO">Efectivo</option>
            <option value="MERCADOPAGO">Mercado Pago</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </Select>
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <div className="text-sm text-muted">
          Total{" "}
          <span className="ml-1 text-2xl font-semibold tabular-nums text-strong">
            {fmtMoneyARS(subtotal)}
          </span>
        </div>
        <button type="submit" disabled={!hasValidLine} className={buttonClasses("solid", "lg")}>
          {isOrder ? "Registrar pedido" : "Cobrar"}
        </button>
      </div>
    </form>
  );
}
