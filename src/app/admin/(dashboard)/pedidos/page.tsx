import Link from "next/link";
import { getPosData, advanceOrderStatus } from "@/lib/order-actions";
import { fmtMoneyARS, EmptyState, ButtonLink, buttonClasses } from "@/components/ui";
import { fmtShortDate, todayInBusinessTz, dateStrInBusinessTz } from "@/lib/datetime";
import { getPosStockSnapshot } from "@/lib/stock/pos-stock";
import { posEmptyState } from "@/lib/stock/pos-stock-rules";
import MostradorTabs from "./MostradorTabs";
import CobrarPedidoForm from "./CobrarPedidoForm";
import EntregarPedidoForm from "./EntregarPedidoForm";
import AnularPedidoForm from "./AnularPedidoForm";
import AjustarPedidoForm from "./AjustarPedidoForm";
import AvisarPorWhatsApp from "./AvisarPorWhatsApp";
import LinkDePagoPedido from "./LinkDePagoPedido";
import {
  ACCION_LINK_DE_PAGO,
  linkDePagoDisponible,
  simulacionDisponible,
  simuladorDeAvisosEncendido,
  textoDelLinkDePago,
  tieneMercadoPago,
  ultimosLinks,
  type LinkEnviado,
} from "./link-de-pago";
import { modoCobrosDesdeEnv } from "@/lib/mercadopago-cobros-dispatch";
import { esLineaDeEnvio, leerCuponDelPedido, whereCuponDelPedido, type CuponDelPedido } from "@/lib/venta-reglas";
import { getProfessionalsWithServices } from "@/lib/actions";
import { canCurrentUser } from "@/lib/authz";
import { alcanceDeAnulacion } from "@/lib/capabilities";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { prisma } from "@/lib/prisma";
import { formatearCantidad } from "@/lib/pos-peso";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { verboDelPaso, etiquetaDeHorario, avisoPedidoListo, ESTADOS_EN_CURSO } from "@/lib/order-anulacion";
import { enInicioPorApps } from "../inicio/piloto";

export const dynamic = "force-dynamic";

// Etiqueta del estado. El botón que avanza lo decide `verboDelPaso` (order-anulacion.ts): en
// comercio, Nuevo pasa directo a Preparando. Listo se entrega con EntregarPedidoForm (pide el
// cobro), y los terminales no avanzan.
type Estado = { label: string; badge: string };

const STATUS: Record<string, Estado> = {
  PENDING: { label: "Pendiente", badge: "bg-warning-soft text-warning" },
  CONFIRMED: { label: "Confirmado", badge: "bg-info-soft text-info" },
  PREPARING: { label: "En preparación", badge: "bg-info-soft text-info" },
  READY: { label: "Listo", badge: "bg-success-soft text-success" },
  DELIVERED: { label: "Entregado", badge: "bg-surface-sunken text-muted" },
  CANCELLED: { label: "Anulado", badge: "bg-danger-soft text-danger" },
};

// Entregado sin cobrar: la mercadería salió y la plata no entró. Sigue en la bandeja, con su
// botón de cobrar, hasta que se cobre o se anule.
const ENTREGADO_A_COBRAR: Estado = { label: "Entregado · a cobrar", badge: "bg-warning-soft text-warning" };

const FULFILLMENT: Record<string, string> = { PICKUP: "Retira", DELIVERY: "Envío" };

const EN_CURSO: ReadonlySet<string> = new Set(ESTADOS_EN_CURSO);

export default async function PedidosPage() {
  // La guardia de la app (rol, módulo pos): esconderla del menú no la protegería. getPosData
  // vuelve a pedir orders:read, como siempre.
  const user = await requireApp("pedidos");
  // ¿Modelo nuevo? En los negocios del Inicio por apps (`APPS_INICIO`) el mostrador vive en
  // /admin/vender y esta pantalla es sólo la bandeja. En CH, y en todo negocio fuera del
  // piloto, la solapa de venta de arriba queda IGUAL que siempre hasta que el dueño apruebe el
  // cambio. Sacar el slug de APPS_INICIO devuelve un negocio a esta pantalla sin tocar datos.
  // Está cacheado por request (el layout ya lo leyó): no suma un viaje a la base.
  const modeloNuevo = await enInicioPorApps();
  // El POS de arriba sólo en el modelo de hoy, y en la MISMA tanda que la bandeja. El snapshot
  // de stock (mismo gate) es lo que permite avisar el faltante antes de cobrar y explicar la
  // caja vacía: "no hay productos" no es lo mismo que "hay, pero sin precio".
  const [{ abiertos, cerrados, products }, identidad, stockSnap, puedeAgenda] = await Promise.all([
    getPosData(),
    getTenantIdentity(),
    modeloNuevo ? Promise.resolve(null) : getPosStockSnapshot(),
    modeloNuevo ? Promise.resolve(false) : canCurrentUser("agenda:manage"),
  ]);
  // Lo nuevo de la bandeja (pesar y ajustar, horario, aviso por WhatsApp, Nuevo → Preparando)
  // es de COMERCIO: en una estética no hay nada que pesar, y su bandeja queda como estaba.
  const comercio = identidad.isRetail;

  // Los servicios del mostrador crean un TURNO, así que se ofrecen sólo a quien puede
  // gestionar agenda (OWNER y RECEPCIÓN), y sólo en un negocio de servicios: en un comercio la
  // solapa «Servicios» era un callejón.
  const professionals = puedeAgenda && !comercio ? await getProfessionalsWithServices() : [];
  const empty =
    stockSnap && products.length === 0
      ? posEmptyState({ activeProducts: stockSnap.activeProducts, canManageCatalog: stockSnap.canManageCatalog })
      : null;

  // Quién puede anular y con qué límite (capabilities.ts). El servidor lo vuelve a decidir en
  // `anularVenta`; acá sólo se usa para ofrecer el botón y avisar si el motivo es obligatorio.
  const alcance = alcanceDeAnulacion(user.role);
  const hoy = todayInBusinessTz();

  // Para el aviso de "tu pedido está listo": el nombre del negocio y, si están cargados, la
  // dirección y el horario del local. Sin cargar, el mensaje no los inventa.
  const local = comercio ? await datosDelLocal() : null;

  // LINK DE PAGO (Mercado Pago), sólo en comercio: la bandeja de CH queda como estaba. Se ofrece
  // únicamente si el negocio tiene contratado Mercado Pago (`Tenant.modules`) y está conectado
  // (o con el simulador de avisos, para probar): la misma regla que la action (link-de-pago.ts).
  const modoCobros = modoCobrosDesdeEnv();
  const simulador = simuladorDeAvisosEncendido();
  const conModulo = comercio
    ? tieneMercadoPago(
        (await prisma.tenant.findUnique({ where: { id: await getCurrentTenantId() }, select: { modules: true } }))?.modules,
      )
    : false;
  const condiciones = { modo: modoCobros, simulador, moduloMercadoPago: conModulo };
  const ofrecerLink = comercio && linkDePagoDisponible(condiciones);
  const simulacion = simulacionDisponible(condiciones);
  const links: Map<string, LinkEnviado> =
    ofrecerLink && abiertos.length
      ? ultimosLinks(
          await prisma.auditLog.findMany({
            where: {
              tenantId: await getCurrentTenantId(),
              entity: "Order",
              action: ACCION_LINK_DE_PAGO,
              entityId: { in: abiertos.map((o) => o.id) },
            },
            select: { entityId: true, createdAt: true, changes: true },
          }),
        )
      : new Map();

  // El cupón de los pedidos que se pueden pesar y tienen descuento: «Pesar y ajustar» recalcula
  // el cupón con su regla (el de monto fijo sigue fijo), la misma que usa el servidor al
  // guardar (`descuentoDelAjuste`). Sólo en comercio (en CH no hay nada que pesar) y sólo si
  // hay algún pedido con descuento: la bandeja de siempre no suma consultas.
  const conDescuento = comercio
    ? abiertos.filter((o) => !o.paid && EN_CURSO.has(o.status) && o.discount > 0).map((o) => o.id)
    : [];
  const cupones = new Map<string, CuponDelPedido>();
  if (conDescuento.length) {
    const filas = await prisma.auditLog.findMany({
      where: whereCuponDelPedido(await getCurrentTenantId(), conDescuento),
      orderBy: { createdAt: "asc" },
      select: { entityId: true, changes: true },
    });
    for (const f of filas) {
      const c = leerCuponDelPedido(f.changes);
      if (f.entityId && c) cupones.set(f.entityId, c);
    }
  }

  return (
    <main className={modeloNuevo ? "mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8" : "mx-auto max-w-4xl px-6 py-8"}>
      {modeloNuevo ? (
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-1">Pedidos para preparar</h1>
            <p className="text-muted">
              Los pedidos de la tienda y los que tomás por teléfono: preparalos, pesalos, avisá
              que están listos, entregalos y cobralos.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/admin/vender" className={buttonClasses("solid", "md")}>
              Vender
            </Link>
            <Link href="/admin/ventas" className={buttonClasses("outline", "md")}>
              Ventas del día
            </Link>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold mb-1">Caja y pedidos</h1>
          <p className="text-muted mb-8">
            {comercio ? (
              <>
                Atendé en el mostrador: elegí el producto, cargá la cantidad —o el peso, si se
                vende por kilo—, cobrá y listo. Los pedidos para retiro o envío caen a la bandeja
                de abajo para seguir su preparación y cobro.
              </>
            ) : (
              <>
                Atendé en el mostrador. En <strong>Productos</strong>: elegí, cargá la cantidad —o el
                peso, si se vende por kilo—, cobrá y listo. En <strong>Servicios</strong>: elegí el
                servicio, la profesional y el horario de la agenda, y cobralo en el acto. Los pedidos
                para retiro o envío caen a la bandeja de abajo para seguir su preparación y cobro.
              </>
            )}
          </p>

          <MostradorTabs
            viewer={{ role: user.role, professionalId: user.professionalId }}
            products={products}
            stockById={stockSnap?.stockById ?? {}}
            professionals={professionals}
            conServicios={!comercio}
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
        </>
      )}

      <h2 className="text-lg font-medium mt-10 mb-3">
        Bandeja de pedidos{abiertos.length > 0 && ` (${abiertos.length} abierto${abiertos.length !== 1 ? "s" : ""})`}
      </h2>

      <div className="space-y-3">
        {abiertos.map((o) => {
          const aCobrar = o.status === "DELIVERED" && !o.paid;
          const s = aCobrar ? ENTREGADO_A_COBRAR : STATUS[o.status];
          const verbo = verboDelPaso(o.status, { comercio });
          // Comercio: el horario pedido (en la zona del negocio), pesar y ajustar mientras no
          // esté cobrado, y avisar por WhatsApp cuando está listo.
          const horario = comercio && o.scheduledFor ? etiquetaDeHorario(o.scheduledFor, o.fulfillment, hoy) : null;
          const sePuedeAjustar = comercio && !o.paid && EN_CURSO.has(o.status);
          // El último link de pago que se le mandó (si hubo), para no generar otro sin necesidad.
          const enviado = links.get(o.id) ?? null;
          const avisoWa =
            local && o.status === "READY"
              ? waLinkClienta(
                  o.customerPhone,
                  avisoPedidoListo({
                    cliente: o.customerName,
                    code: o.code,
                    total: o.total,
                    pagado: o.paid,
                    fulfillment: o.fulfillment,
                    direccionEnvio: o.address,
                    negocio: local.negocio,
                    direccionLocal: local.direccion,
                    horarioLocal: local.horario,
                  }),
                )
              : null;
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
                    {horario && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          horario.esHoy ? "bg-warning-soft text-warning" : "bg-surface-sunken text-muted"
                        }`}
                      >
                        {horario.texto}
                      </span>
                    )}
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
                        {/* Con coma, como se lee acá: "0,25 kg", no "0.25". */}
                        {formatearCantidad(it.quantity)}
                        {it.saleUnit === "WEIGHT" ? " kg" : " u"} · {it.name} —{" "}
                        {fmtMoneyARS(it.lineTotal)}
                        {comercio && it.productId == null && (
                          <span className="text-faint">{esLineaDeEnvio(it) ? " (envío)" : " (precio a mano)"}</span>
                        )}
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
                  {verbo && (
                    <form action={advanceOrderStatus}>
                      <input type="hidden" name="id" value={o.id} />
                      <button
                        type="submit"
                        className={`chip-btn text-xs min-h-8 w-full sm:w-auto${comercio ? " h-11 sm:h-auto" : ""}`}
                      >
                        {verbo}
                      </button>
                    </form>
                  )}
                  {sePuedeAjustar && (
                    <AjustarPedidoForm
                      id={o.id}
                      code={o.code}
                      subtotal={o.subtotal}
                      descuento={o.discount}
                      cupon={cupones.get(o.id) ?? null}
                      items={o.items.map((it) => ({
                        productId: it.productId,
                        name: it.name,
                        saleUnit: it.saleUnit,
                        quantity: it.quantity,
                        unitPrice: it.unitPrice,
                        lineTotal: it.lineTotal,
                      }))}
                    />
                  )}
                  {avisoWa && <AvisarPorWhatsApp orderId={o.id} href={avisoWa} />}
                  {/* Listo: entregar pide el cobro o «Queda a cobrar» (EntregarPedidoForm). */}
                  {o.status === "READY" && <EntregarPedidoForm id={o.id} code={o.code} paid={o.paid} />}
                  {/* Cobrar sin entregar sigue estando, también en Listo: el que pagó por
                      transferencia y retira más tarde. Sin medio por defecto y con el motivo
                      del rechazo en pantalla (antes era un select en EFECTIVO y un botón mudo). */}
                  {!o.paid && <CobrarPedidoForm id={o.id} code={o.code} />}
                  {/* En el modo de prueba, un pedido ya cobrado por su link sigue ofreciendo repetir
                      el aviso: es como se ve que Mercado Pago reintentando no asienta dos veces. */}
                  {ofrecerLink && (!o.paid || (simulacion && enviado)) && (
                    <LinkDePagoPedido
                      id={o.id}
                      code={o.code}
                      total={o.total}
                      cobrado={o.paid}
                      enviado={enviado}
                      whatsappEnviado={
                        enviado && local
                          ? waLinkClienta(
                              o.customerPhone,
                              textoDelLinkDePago({ negocio: local.negocio, code: o.code, monto: enviado.monto, url: enviado.url }),
                            )
                          : null
                      }
                      simulacion={simulacion}
                    />
                  )}
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

        {abiertos.length === 0 &&
          (modeloNuevo ? (
            <EmptyState
              title="No hay pedidos para preparar"
              description="Los pedidos de la tienda online y los que tomás por teléfono aparecen acá."
              action={<ButtonLink href="/admin/vender?modo=pedido">Tomar un pedido</ButtonLink>}
            />
          ) : (
            <p className="text-sm text-muted">
              No hay pedidos abiertos. Registrá una venta o un pedido arriba.
            </p>
          ))}
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
                          // Saldada sin medio = venta a cuenta: la anulación saca la deuda, no plata de la caja.
                          aCuenta={o.paid && !o.paymentMethod}
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

/**
 * Lo que dice el aviso de "pedido listo" sobre el local: el nombre del negocio y, SÓLO si
 * están cargados en Datos del negocio, la dirección y el horario. No usa `getLocation`: sus
 * valores por defecto son los de otro negocio y el aviso los mandaría como propios.
 */
async function datosDelLocal(): Promise<{ negocio: string; direccion: string | null; horario: string | null }> {
  const tenantId = await getCurrentTenantId();
  const [t, bs] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.businessSettings
      .findUnique({ where: { tenantId }, select: { addressLine: true, hoursLabel: true } })
      .catch(() => null),
  ]);
  return {
    negocio: t?.name ?? "el local",
    direccion: bs?.addressLine?.trim() || null,
    horario: bs?.hoursLabel?.trim() || null,
  };
}
