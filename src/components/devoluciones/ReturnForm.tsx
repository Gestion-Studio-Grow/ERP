"use client";

import { useMemo, useState } from "react";
import { Input, Select, buttonClasses, EmptyState } from "@/components/ui";
import { validateReturnLine, hasValidReturnLine } from "@/lib/devoluciones/return-validation";
import type { PurchaseOption } from "@/lib/devoluciones/types";

const qtyFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

// Form de DEVOLUCIÓN a proveedor (D4): se elige una COMPRA, se marcan cantidades a
// devolver por línea (tope = lo comprado) y un motivo. La validación (no devolver más de
// lo comprado) es la misma regla PURA (`validateReturnLine`) que el servidor. Al confirmar,
// el servicio de S1 asienta stock + crédito en cuentas a pagar. Canal neutro; el color acá
// lo pone solo el error de validación.
export function ReturnForm({
  purchases,
  action,
}: {
  purchases: PurchaseOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [purchaseId, setPurchaseId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});

  const purchase = useMemo(() => purchases.find((p) => p.id === purchaseId) ?? null, [purchases, purchaseId]);

  if (purchases.length === 0) {
    return (
      <EmptyState
        title="Sin compras para devolver"
        description="Cuando registres compras a proveedores vas a poder devolver mercadería desde acá (se descuenta del stock y genera un crédito en la cuenta a pagar)."
      />
    );
  }

  const lines = (purchase?.items ?? []).map((it) => ({
    it,
    q: Number((qty[it.id] ?? "").trim().replace(",", ".")),
  }));
  const canSubmit = hasValidReturnLine(lines.map((l) => ({ qty: l.q, purchased: l.it.purchased })));

  return (
    <form action={action} className="rounded-lg border border-line p-4 space-y-4">
      <input type="hidden" name="purchaseId" value={purchaseId} />

      <label className="block text-sm">
        <span className="block text-muted mb-1">Compra a devolver</span>
        <Select value={purchaseId} onChange={(e) => { setPurchaseId(e.target.value); setQty({}); }}>
          <option value="">Elegí una compra…</option>
          {purchases.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </Select>
      </label>

      {purchase && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-xs text-faint">Cantidad a devolver por producto (tope = lo comprado):</p>
          {purchase.items.map((it) => {
            const raw = qty[it.id] ?? "";
            const q = Number(raw.trim().replace(",", "."));
            const touched = raw.trim() !== "";
            const invalid = touched && !validateReturnLine(q, it.purchased).ok;
            return (
              <div key={it.id} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[1fr_120px_140px]">
                <span className="min-w-0 truncate text-sm">
                  {it.name} <span className="text-faint">· compró {qtyFmt.format(it.purchased)} {it.unit}</span>
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  max={it.purchased}
                  value={raw}
                  placeholder="0"
                  onChange={(e) => setQty((m) => ({ ...m, [it.id]: e.target.value }))}
                  aria-invalid={invalid}
                  className="text-right tabular-nums"
                />
                {touched && q > 0 && (
                  <>
                    <input type="hidden" name="productId" value={it.productId ?? ""} />
                    <input type="hidden" name="qty" value={validateReturnLine(q, it.purchased).ok ? q : ""} />
                  </>
                )}
                {invalid ? (
                  <span className="text-xs text-danger sm:col-span-1">No podés devolver más de lo comprado.</span>
                ) : (
                  <span className="hidden sm:block" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <label className="block text-sm">
        <span className="block text-muted mb-1">Motivo</span>
        <Input name="motivo" placeholder="ej: falla, vencimiento, error de pedido" />
      </label>

      <div className="flex justify-end border-t border-line pt-4">
        <button type="submit" disabled={!canSubmit} className={buttonClasses("solid", "sm")}>
          Registrar devolución
        </button>
      </div>
    </form>
  );
}
