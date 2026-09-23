import { getPosData, advanceOrderStatus } from "@/lib/order-actions";
import { fmtMoneyARS, EmptyState, ButtonLink } from "@/components/ui";
import { fmtShortDate, todayInBusinessTz, dateStrInBusinessTz } from "@/lib/datetime";
import { getPosStockSnapshot } from "@/lib/stock/pos-stock";
import { posEmptyState } from "@/lib/stock/pos-stock-rules";
import MostradorTabs from "./MostradorTabs";
import CobrarPedidoForm from "./CobrarPedidoForm";
import EntregarPedidoForm from "./EntregarPedidoForm";
import AnularPedidoForm from "./AnularPedidoForm";
import { getProfessionalsWithServices } from "@/lib/actions";
import { canCurrentUser } from "@/lib/authz";
import { alcanceDeAnulacion } from "@/lib/capabilities";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Etiqueta + verbo del botón que avanza al siguiente estado. Sin `next` = ese paso no es un
// avance simple: Listo se entrega con EntregarPedidoForm (pide el cobro), y los terminales no
// avanzan.
type Estado = { label: string; badge: string; next?: string };

const STATUS: Record<string, Estado> = {
  PENDING: { label: "Pendiente", badge: "bg-warning-soft text-warning", next: "Confirmar" },
  CONFIRMED: { label: "Confirmado", badge: "bg-info-soft text-info", next: "Pasar a preparación" },
  PREPARING: { label: "En preparación", badge: "bg-info-soft text-info", next: "Marcar listo" },
  READY: { label: "Listo", badge: "bg-success-soft text-success" },
  DELIVERED: { label: "Entregado", badge: "bg-surface-sunken text-muted" },
  CANCELLED: { label: "Anulado", badge: "bg-danger-soft text-danger" },
};

// Entregado sin cobrar: la mercadería salió y la plata no entró. Sigue en la bandeja, con su
// botón de cobrar, hasta que se cobre o se anule.
const ENTREGADO_A_COBRAR: Estado = { label: "Entregado · a cobrar", badge: "bg-warning-soft text-warning" };

const FULFILLMENT: Record<string, string> = { PICKUP: "Retira", DELIVERY: "Envío" };

export default async function PedidosPage() {
  // getPosData aplica requireCapability("orders:read") — guard de la página. El snapshot de
  // stock (mismo gate) es lo que permite avisar el faltante antes de cobrar y explicar la
  // caja vacía: "no hay productos" no es lo mismo que "hay, pero sin precio".
  const [{ abiertos, cerrados, products }, stockSnap, puedeAgenda, user] = await Promise.all([
    getPosData(),
    getPosStockSnapshot(),
    canCurrentUser("agenda:manage"),
    getCurrentUser(),
  ]);
  // Los servicios del mostrador crean un TURNO, así que se ofrecen sólo a quien puede
  // gestionar agenda (OWNER y RECEPCIÓN). El catálogo es público (lo usa el sitio de
  // reservas), pero la solapa no aparece si el rol no puede dar de alta un turno.
  const professionals = puedeAgenda ? await getProfessionalsWithServices() : [];
  const empty =
    products.length === 0
      ? posEmptyState({ activeProducts: stockSnap.activeProducts, canManageCatalog: stockSnap.canManageCatalog })
      : null;

  // Quién puede anular y con qué límite (capabilities.ts). El servidor lo vuelve a decidir en
  // `anularVenta`; acá sólo se usa para ofrecer el botón y avisar si el motivo es obligatorio.
  const alcance = user ? alcanceDeAnulacion(user.role) : null;
  const hoy = todayInBusinessTz();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Caja y pedidos</h1>
      <p className="text-muted mb-8">
        Atendé en el mostrador. En <strong>Productos</strong>: elegí, cargá la cantidad —o el
        peso, si se vende por kilo—, cobrá y listo. En <strong>Servicios</strong>: elegí el
        servicio, la profesional y el horario de la agenda, y cobralo en el acto. Los pedidos
        para retiro o envío caen a la bandeja de abajo para seguir su preparación y cobro.
      </p>

      <MostradorTabs
        viewer={user ? { role: user.role, professionalId: user.professionalId } : undefined}
        products={products}
        stockById={stockSnap.stockById}
        professionals={professionals}
        productosBloqueados={
          empty ? (
            <EmptyState
              title={empty.title}
              description={empty.description}
              action={
                empty.linkToCatalog ? (
                  <ButtonLink href="/admin/catalogo#productos">Ir al catálogo a cargar precios</ButtonLink>
                ) : undefined
              }
            />
          ) : undefined
        }
      />

      <h2 className="text-lg font-medium mt-10 mb-3">
        Bandeja de pedidos{abiertos.length > 0 && ` (${abiertos.length} abierto${abiertos.length !== 1 ? "s" : ""})`}
      </h2>

      <div className="space-y-3">
        {abiertos.map((o) => {
          const aCobrar = o.status === "DELIVERED" && !o.paid;
          const s = aCobrar ? ENTREGADO_A_COBRAR : STATUS[o.status];
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
                      // Entregado sin cobrar ya lo dice su propia etiqueta.
                      !aCobrar && (
                        <span className="rounded-full bg-warning-soft text-warning px-2 py-0.5 text-[11px] font-medium">
                          A cobrar
                        </span>
                      )
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
                        {fmtMoneyARS(it.lineTotal)}
                      </li>
                    ))}
                  </ul>
                  {o.address && <p className="text-xs text-faint mt-1">Envío a: {o.address}</p>}
                  {o.notes && <p className="text-xs text-faint mt-0.5">Nota: {o.notes}</p>}
                  <p className="text-xs text-faint mt-1">
                    {fmtMoneyARS(o.total)} · {fmtShortDate(o.createdAt)}
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
                  {/* Listo: entregar pide el cobro o «Queda a cobrar» (EntregarPedidoForm). */}
                  {o.status === "READY" && <EntregarPedidoForm id={o.id} code={o.code} paid={o.paid} />}
                  {/* Cobrar sin entregar sigue estando, también en Listo: el que pagó por
                      transferencia y retira más tarde. Sin medio por defecto y con el motivo
                      del rechazo en pantalla (antes era un select en EFECTIVO y un botón mudo). */}
                  {!o.paid && <CobrarPedidoForm id={o.id} code={o.code} />}
                  {alcance && (
                    <AnularPedidoForm
                      id={o.id}
                      code={o.code}
                      paid={o.paid}
                      total={o.total}
                      motivoObligatorio={alcance.motivoObligatorio}
                    />
                  )}
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
            {cerrados.map((o) => {
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
                  <span className="ml-auto tabular-nums text-muted">{fmtMoneyARS(o.total)}</span>
                  <span className="text-xs text-faint">{fmtShortDate(o.createdAt)}</span>
                  {/* La venta de mostrador cobrada NACE entregada y cae acá: sin este botón no había
                      forma de anular un ticket mal cobrado. anularVenta acepta DELIVERED a
                      propósito (order-anulacion.ts). Recepción sólo ve el botón en las de hoy, que
                      es lo que el servidor le deja hacer (soloHoy); el servidor lo vuelve a exigir. */}
                  {alcance &&
                    o.status === "DELIVERED" &&
                    (!alcance.soloHoy || dateStrInBusinessTz(new Date(o.createdAt)) === hoy) && (
                      <div className="basis-full">
                        <AnularPedidoForm
                          id={o.id}
                          code={o.code}
                          paid={o.paid}
                          total={o.total}
                          motivoObligatorio={alcance.motivoObligatorio}
                        />
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
