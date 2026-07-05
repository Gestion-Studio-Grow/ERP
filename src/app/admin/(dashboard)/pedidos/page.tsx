import {
  getPosData,
  advanceOrderStatus,
  setOrderPaid,
  cancelOrder,
} from "@/lib/order-actions";
import { fmtShortDate } from "@/lib/datetime";
import PosForm from "./PosForm";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

// Etiqueta + verbo del botón que avanza al siguiente estado. null = terminal.
const STATUS: Record<string, { label: string; badge: string; next?: string }> = {
  PENDING: { label: "Pendiente", badge: "bg-warning-soft text-warning", next: "Confirmar" },
  CONFIRMED: { label: "Confirmado", badge: "bg-info-soft text-info", next: "A preparar" },
  PREPARING: { label: "En preparación", badge: "bg-info-soft text-info", next: "Marcar listo" },
  READY: { label: "Listo", badge: "bg-success-soft text-success", next: "Entregar" },
  DELIVERED: { label: "Entregado", badge: "bg-surface-sunken text-muted" },
  CANCELLED: { label: "Cancelado", badge: "bg-danger-soft text-danger" },
};

const FULFILLMENT: Record<string, string> = { PICKUP: "Retira", DELIVERY: "Envío" };

export default async function PedidosPage() {
  // getPosData aplica requireCapability("orders:read") — guard de la página.
  const { orders, products } = await getPosData();

  const abiertos = orders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED");
  const cerrados = orders.filter((o) => o.status === "DELIVERED" || o.status === "CANCELLED");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Caja y pedidos</h1>
      <p className="text-muted mb-8">
        Atendé en el mostrador: elegí el producto, pesalo (por kg) o cargá la cantidad (por unidad),
        cobrá y listo. O tomá un pedido para retiro/envío — los pedidos abiertos caen a la bandeja de
        abajo para seguir su preparación y cobro.
      </p>

      <PosForm products={products} />

      <h2 className="text-lg font-medium mt-10 mb-3">
        Bandeja de pedidos{abiertos.length > 0 && ` (${abiertos.length} abierto${abiertos.length !== 1 ? "s" : ""})`}
      </h2>

      <div className="space-y-3">
        {abiertos.map((o) => {
          const s = STATUS[o.status];
          return (
            <div key={o.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">#{o.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.badge}`}>
                      {s.label}
                    </span>
                    <span className="text-xs text-faint">
                      {o.channel === "ONLINE" ? "Pedido" : "Mostrador"} · {FULFILLMENT[o.fulfillment]}
                    </span>
                    {o.paid ? (
                      <span className="rounded-full bg-success-soft text-success px-2 py-0.5 text-[11px] font-medium">
                        Cobrado
                      </span>
                    ) : (
                      <span className="rounded-full bg-warning-soft text-warning px-2 py-0.5 text-[11px] font-medium">
                        A cobrar
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-body mt-1">
                    {o.customerName}
                    {o.customerPhone && <span className="text-faint"> · {o.customerPhone}</span>}
                  </p>
                  <ul className="text-xs text-muted mt-1 space-y-0.5">
                    {o.items.map((it) => (
                      <li key={it.id}>
                        {it.quantity}
                        {it.saleUnit === "WEIGHT" ? " kg" : " u"} · {it.name} —{" "}
                        {money.format(it.lineTotal)}
                      </li>
                    ))}
                  </ul>
                  {o.address && <p className="text-xs text-faint mt-1">Envío a: {o.address}</p>}
                  {o.notes && <p className="text-xs text-faint mt-0.5">Nota: {o.notes}</p>}
                  <p className="text-xs text-faint mt-1">
                    {money.format(o.total)} · {fmtShortDate(o.createdAt)}
                  </p>
                </div>

                <div className="flex flex-col gap-2 items-stretch sm:items-end whitespace-nowrap">
                  {s.next && (
                    <form action={advanceOrderStatus}>
                      <input type="hidden" name="id" value={o.id} />
                      <button type="submit" className="chip-btn text-xs min-h-8 w-full sm:w-auto">
                        {s.next}
                      </button>
                    </form>
                  )}
                  {!o.paid && (
                    <form action={setOrderPaid} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={o.id} />
                      <select
                        name="paymentMethod"
                        defaultValue="EFECTIVO"
                        className="rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-xs"
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="MERCADOPAGO">MP</option>
                        <option value="TRANSFERENCIA">Transf.</option>
                      </select>
                      <button type="submit" className="chip-btn text-xs min-h-8">
                        Cobrar
                      </button>
                    </form>
                  )}
                  <form action={cancelOrder}>
                    <input type="hidden" name="id" value={o.id} />
                    <button
                      type="submit"
                      className="chip-btn chip-btn-danger text-xs min-h-8 w-full sm:w-auto"
                    >
                      Cancelar
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}

        {abiertos.length === 0 && (
          <p className="text-sm text-muted">
            No hay pedidos abiertos. Registrá una venta o un pedido arriba.
          </p>
        )}
      </div>

      {cerrados.length > 0 && (
        <>
          <h2 className="text-lg font-medium mt-10 mb-3">Cerrados recientes</h2>
          <div className="space-y-2">
            {cerrados.slice(0, 20).map((o) => {
              const s = STATUS[o.status];
              return (
                <div
                  key={o.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-4 py-2 text-sm"
                >
                  <span className="font-medium">#{o.code}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.badge}`}>
                    {s.label}
                  </span>
                  <span className="text-body">{o.customerName}</span>
                  <span className="ml-auto tabular-nums text-muted">{money.format(o.total)}</span>
                  <span className="text-xs text-faint">{fmtShortDate(o.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
