"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createOrder } from "@/lib/order-actions";
import { Input, Select, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { stockShortfall, type PosStockInfo } from "@/lib/stock/pos-stock-rules";
import { useToast } from "../ToastProvider";

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

// Botón de cobro que se BLOQUEA mientras el envío está en vuelo.
//
// Sin esto, un doble clic cobraba DOS VECES: el QA midió dos `Order` idénticos a 73 ms
// uno del otro, dos movimientos VENTA y el efectivo esperado del turno subiendo el
// doble. Es plata mal contada en el arqueo. `useFormStatus` cierra la ventana en el
// cliente, que es la misma defensa con la que el libro de caja y la caja de mostrador
// YA resisten el doble clic (el QA lo verificó en los dos).
//
// PENDIENTE, y anotado a propósito: falta la guarda a nivel BASE. `insertOrder` soporta
// `idempotencyKey`, pero la vidriera la genera UNA vez por visita porque es un checkout
// de una sola compra; el mostrador vende muchas veces por sesión, así que una clave sin
// renovar bloquearía la segunda venta idéntica legítima — peor que el bug que cierra.
// Necesita un diseño propio (clave con ventana de tiempo), no un copiar y pegar.
function CobrarSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`${buttonClasses("solid", "lg")} disabled:opacity-50`}
    >
      {pending ? "Cobrando…" : label}
    </button>
  );
}

// Un error de Server Action en producción llega al cliente con el mensaje REDACTADO (Next no
// reenvía `error.message`), así que no se puede distinguir "sin stock" de otra falla. Lo que sí
// hay que dejar pasar es el redirect de `requireCapability` (sesión vencida), que Next modela
// como una excepción con digest NEXT_REDIRECT: tragarla dejaría al usuario sin login.
function isNextRedirect(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export default function PosForm({
  products,
  stockById,
}: {
  products: SellableProduct[];
  // Stock y flag de control por producto (getPosStockSnapshot): lo que permite avisar
  // el faltante ANTES de mandar la venta. Puede faltar un id (producto recién borrado):
  // en ese caso no se bloquea acá y decide la guarda del server.
  stockById: Record<string, PosStockInfo>;
}) {
  const { showError, showSuccess } = useToast();
  // Caja de mostrador (venta rápida, se cobra en el acto) vs. pedido con retiro/envío.
  const [isOrder, setIsOrder] = useState(false);
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", qty: 0 }]);
  const [nextKey, setNextKey] = useState(2);
  // Foco dirigido: al elegir un producto saltamos a pesar/contar; con Enter saltamos
  // al próximo producto. Es lo que hace fluida la atención en mostrador (sin mouse).
  // Cada pedido de foco lleva su número de orden: así el efecto sabe que hay uno
  // NUEVO (aunque sea al mismo campo) sin tener que "consumirlo" borrándolo — que
  // era un setState dentro del efecto, o sea un render de más en cada tecla.
  const [focusPedido, setFocusPedido] = useState<{ id: string; n: number } | null>(null);
  const focusN = useRef(0);
  const pedirFoco = (id: string) => setFocusPedido({ id, n: ++focusN.current });

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    if (!focusPedido) return;
    document.getElementById(focusPedido.id)?.focus();
  }, [focusPedido]);

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
  // Alguna línea pide más de lo que hay (sólo productos con control de stock). Se bloquea el
  // cobro acá para que la persona corrija la cantidad en vez de chocar con el error del server.
  const hasShortfall = lines.some((l) => stockShortfall(stockById[l.productId], l.qty) != null);

  // Cobra y, si salió bien, limpia el ticket: dejar las líneas cargadas después de cobrar es
  // invitar a cobrar dos veces lo mismo. Si falló, el ticket queda como estaba para corregir.
  async function submit(fd: FormData) {
    try {
      await createOrder(fd);
    } catch (e) {
      if (isNextRedirect(e)) throw e;
      showError(
        "No se pudo registrar la venta. Si el producto controla stock, revisá que alcance y volvé a intentar.",
      );
      return;
    }
    showSuccess(isOrder ? "Pedido registrado." : "Venta cobrada.");
    setLines([{ key: nextKey, productId: "", qty: 0 }]);
    setNextKey((k) => k + 1);
  }

  // Defensivo: la página ya muestra el estado vacío con la salida al catálogo antes de llegar acá.
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-sunken p-4 text-sm text-muted">
        No hay productos con precio de venta cargado. Cargalos en el catálogo (precio por unidad o
        por kg) para poder venderlos en la caja.
      </div>
    );
  }

  return (
    <form action={submit} className="rounded-lg border border-line p-4 space-y-4">
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
            Elegí el producto, cargá la cantidad (o el peso) y cobrá. Enter salta al siguiente.
          </span>
        )}
      </div>

      {/* Ticket: líneas de venta */}
      <div className="space-y-2">
        {lines.map((l) => {
          const p = byId.get(l.productId);
          const isWeight = p?.saleUnit === "WEIGHT";
          const lineTotal = p && l.qty > 0 ? l.qty * unitPriceOf(p) : 0;
          const short = stockShortfall(stockById[l.productId], l.qty);
          return (
            <div key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_128px_auto]">
              <Select
                className="col-span-2 sm:col-span-1"
                id={`prod-${l.key}`}
                aria-label="Producto"
                value={l.productId}
                onChange={(e) => {
                  setLine(l.key, { productId: e.target.value, qty: 0 });
                  if (e.target.value) pedirFoco(`qty-${l.key}`); // saltar a pesar/contar
                }}
              >
                <option value="">Elegí un producto…</option>
                {products.map((prod) => {
                  const info = stockById[prod.id];
                  return (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} —{" "}
                      {prod.saleUnit === "WEIGHT"
                        ? `${fmtMoneyARS(prod.pricePerKg ?? 0)}/kg`
                        : `${fmtMoneyARS(prod.price ?? 0)}/u`}
                      {/* Disponible sólo si el producto controla stock: si no, el número no manda. */}
                      {info?.trackStock
                        ? ` · quedan ${info.stock} ${prod.saleUnit === "WEIGHT" ? "kg" : "u"}`
                        : ""}
                    </option>
                  );
                })}
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
                      if (l.qty > 0) pedirFoco(`prod-${addLine()}`);
                    }
                  }}
                  disabled={!p}
                  aria-invalid={short ? true : undefined}
                  className="pr-8 text-right tabular-nums"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint">
                  {p ? (isWeight ? "kg" : "u") : ""}
                </span>
              </div>
              {short && (
                <p role="alert" className="col-span-2 sm:col-span-3 text-xs text-danger">
                  No alcanza el stock: quedan {short.available} {isWeight ? "kg" : "u"} de {p?.name}.
                </p>
              )}
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
        <button type="button" onClick={() => pedirFoco(`prod-${addLine()}`)} className="chip-btn text-sm">
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
        <CobrarSubmit disabled={!hasValidLine || hasShortfall} label={isOrder ? "Registrar pedido" : "Cobrar"} />
      </div>
    </form>
  );
}
