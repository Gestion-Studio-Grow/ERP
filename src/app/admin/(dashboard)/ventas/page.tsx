import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { alcanceDeAnulacion, roleHasCapability } from "@/lib/capabilities";
import { businessWallTimeToUtc, fmtShortDate, fmtTime, todayInBusinessTz } from "@/lib/datetime";
import { nextDayKey } from "@/lib/caja/cierre-diario";
import { MEDIOS_DE_COBRO } from "@/lib/caja/medio-cobro";
import {
  whereVentasCobradas,
  whereVentasAnuladas,
  whereAnulacionesDelDia,
  leerAnulacion,
  porQuien,
} from "@/lib/order-anulacion";
import { fmtMoneyARS } from "@/components/ui/format";
import { EmptyState, PageContainer, PageHeader, Select, buttonClasses } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import FilaVenta from "./FilaVenta";
import {
  leerFiltros,
  notaDeCupon,
  notaDeDescuento,
  resumenACuenta,
  resumenDeVentas,
  vacioDeVentas,
  ventasCobradasDeVerdad,
} from "./filtros";
import { estadoDeFactura, SIN_FACTURA, type FacturaDeVenta } from "./factura";
import { puedeAbrirApp } from "../vender/puede-abrir";
import { ventaDeOrden } from "../vender/reglas-venta";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { LineaDeEstado, Marca, Plata, Renglon, atributosBoton, chipLinkAtributos, hrefConParametros } from "@/components/ui";
import { PasoDePeriodo } from "@/components/ui/PasoDePeriodo";
import { diaAnterior, diaLargo, diaMes } from "../caja/_renglon/fechas";
import TablaDeVentas, { type FilaDeVenta } from "./TablaDeVentas";

export const dynamic = "force-dynamic";

// VENTAS DEL DÍA — encontrar una venta cobrada para anularla (la pesada mal hecha, el caso de
// todos los días) o reenviar el ticket.
//
// QUIÉN VE QUÉ:
//   · la dueña o el dueño: cualquier día, con los montos del día (total y ticket promedio), y
//     anula lo de cualquier día que no esté cerrado;
//   · recepción: SÓLO hoy, anula con motivo y ve cada venta con su importe (lo cobró ella y lo
//     necesita para encontrarla), pero no el total del día (eso pide reports:read).
// El control de las anulaciones es por VISIBILIDAD: arriba dice quién anuló y por qué, y el
// Inicio de la dueña lo repite ("2 anulaciones hoy, por Juan"), con el mismo `where`.

const LIMITE = 500;

const SELECT_VENTA = {
  id: true,
  code: true,
  createdAt: true,
  channel: true,
  subtotal: true,
  discount: true,
  total: true,
  paymentMethod: true,
  paid: true,
  customerName: true,
  customerPhone: true,
  status: true,
  items: {
    select: { productId: true, name: true, saleUnit: true, quantity: true, unitPrice: true, lineTotal: true },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.OrderSelect;

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string | string[]; medio?: string | string[]; canal?: string | string[] }>;
}) {
  const user = await requireApp("ventas-del-dia");
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const verPlata = roleHasCapability(user.role, "reports:read");
  const alcance = alcanceDeAnulacion(user.role);
  const puedeVender = roleHasCapability(user.role, "orders:manage");
  const filtros = leerFiltros(await searchParams, { hoy, otrosDias: verPlata });
  // «Facturar» en cada fila: con la MISMA regla que exige su action (app Facturación: módulo arca
  // y billing:manage). Sin ella, la fila no muestra nada de facturas: como hasta hoy.
  const [puedeFacturar, nuevo] = await Promise.all([puedeAbrirApp("facturacion"), disenoNuevo()]);
  const esHoy = filtros.dia === hoy;

  // Hoy: desde las 00:00 sin tope (el mismo corte que el número del Inicio). Otro día: ese día.
  // La lista trae también las ventas a cuenta (marcadas); la cuenta de "cobradas", no.
  const desde = businessWallTimeToUtc(filtros.dia, "00:00");
  const hasta = esHoy ? null : businessWallTimeToUtc(nextDayKey(filtros.dia), "00:00");
  const extra: Prisma.OrderWhereInput = {
    ...(filtros.medio ? { paymentMethod: filtros.medio } : {}),
    ...(filtros.canal ? { channel: filtros.canal } : {}),
  };

  const [vigentes, anuladas, anulacionesDelDia, tenant, usuarios] = await Promise.all([
    prisma.order.findMany({
      where: { ...whereVentasCobradas(tenantId, desde, hasta), ...extra },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: SELECT_VENTA,
    }),
    prisma.order.findMany({
      where: { ...whereVentasAnuladas(tenantId, desde, hasta), ...extra },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: SELECT_VENTA,
    }),
    prisma.auditLog.findMany({
      where: whereAnulacionesDelDia(tenantId, desde, hasta),
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: { entityId: true, actor: true, changes: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } }),
  ]);
  const nombres = new Map(usuarios.map((u) => [u.id, u.name]));
  const negocio = tenant?.name ?? "Mi negocio";

  // El rastro de cada venta de la lista: quién la anuló y por qué (las anuladas), y con qué
  // descuento o precio a mano se cobró (el alta). Una sola lectura para toda la lista.
  const ids = [...vigentes, ...anuladas].map((o) => o.id);
  const rastros = ids.length
    ? await prisma.auditLog.findMany({
        where: {
          tenantId,
          entity: "Order",
          entityId: { in: ids },
          OR: [{ action: "create" }, { action: "update", changes: { path: ["status"], equals: "CANCELLED" } }],
        },
        select: { entityId: true, action: true, actor: true, changes: true },
      })
    : [];
  const rastrosPorVenta = new Map<string, typeof rastros>();
  for (const r of rastros) {
    if (!r.entityId) continue;
    rastrosPorVenta.set(r.entityId, [...(rastrosPorVenta.get(r.entityId) ?? []), r]);
  }
  const notasDe = (o: { id: string; subtotal: number; discount: number }): string[] => {
    const out: string[] = [];
    for (const r of rastrosPorVenta.get(o.id) ?? []) {
      if (r.action === "update") {
        const a = leerAnulacion(r, nombres);
        out.push(`Anuló ${a.quien}${a.motivo ? `: ${a.motivo}` : ""}.`);
        continue;
      }
      const c = (r.changes ?? {}) as Record<string, unknown>;
      // El monto sale del PEDIDO y quién lo aplicó, del alta (`notaDeDescuento`).
      const d = c.descuento as { monto?: unknown; por?: unknown } | undefined;
      const nota = d ? notaDeDescuento(o, typeof d.por === "string" ? d.por : null) : null;
      if (nota) out.push(nota);
      // El código del alta y el monto del pedido: si se pesó, el cupón se recalculó.
      const cupon = notaDeCupon(c.cupon, o.discount);
      if (cupon) out.push(cupon);
      const manos = Array.isArray(c.preciosAMano) ? (c.preciosAMano as { nombre?: unknown; motivo?: unknown }[]) : [];
      for (const m of manos) {
        if (typeof m.nombre === "string") {
          out.push(`Precio a mano en «${m.nombre}»${typeof m.motivo === "string" ? `: ${m.motivo}` : ""}.`);
        }
      }
    }
    return out;
  };

  // "Ventas cobradas" cuenta lo que se cobró: la venta a cuenta va en la lista, no en la cuenta.
  const resumen = resumenDeVentas(ventasCobradasDeVerdad(vigentes));
  const aCuenta = resumenACuenta(vigentes);

  // El estado de la factura de cada venta. La tabla de comprobantes se lee SÓLO con la
  // facturación encendida (su migración va con el flag, fiscal.ts): apagada, todas dicen «Sin
  // factura» y el botón explica por qué no se emite.
  const facturacionEncendida = isInvoicingEnabled();
  const facturas =
    puedeFacturar && facturacionEncendida && ids.length
      ? await prisma.invoice.findMany({
          where: { tenantId, orderId: { in: ids } },
          orderBy: { createdAt: "desc" },
          select: { orderId: true, status: true, numero: true, puntoVenta: true, tipoComprobante: true, rechazoMotivo: true },
        })
      : [];
  const facturaDe = new Map<string, FacturaDeVenta>();
  for (const f of facturas) {
    if (f.orderId && !facturaDe.has(f.orderId)) facturaDe.set(f.orderId, estadoDeFactura(f));
  }
  const anulacionesLeidas = anulacionesDelDia.map((f) => leerAnulacion(f, nombres));
  const montoAnulado = anulacionesLeidas.reduce((s, a) => s + a.monto, 0);
  const lista = [...vigentes, ...anuladas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const cuando = esHoy ? "hoy" : `el ${fmtShortDate(desde)}`;
  // Recepción anula sólo lo de hoy (el servidor lo vuelve a exigir en `anularVenta`).
  const anulaEsteDia = alcance && (!alcance.soloHoy || esHoy) ? { motivoObligatorio: alcance.motivoObligatorio } : null;
  const hayFiltro = filtros.medio !== null || filtros.canal !== null;
  const vacio = vacioDeVentas({ esHoy, hayFiltro, cuando, puedeVender });
  const destinoVacio = {
    "sacar-filtro": esHoy ? "/admin/ventas" : `/admin/ventas?dia=${filtros.dia}`,
    vender: "/admin/vender",
    hoy: "/admin/ventas",
  } as const;

  // DISEÑO NUEVO («Renglón»): los mismos datos y las mismas acciones, en una tabla densa con la
  // venta entera en un cajón. Apagado, lo de abajo tal cual.
  if (nuevo) {
    const RUTA = "/admin/ventas";
    const filas: FilaDeVenta[] = lista.map((o) => {
      const venta = ventaDeOrden(o);
      return {
        venta,
        hora: fmtTime(o.createdAt),
        canal: o.channel,
        notas: notasDe(o),
        factura: puedeFacturar && !venta.anulada ? (facturaDe.get(o.id) ?? SIN_FACTURA) : null,
        anular: venta.anulada ? null : anulaEsteDia,
      };
    });
    const filtroHref = (cambios: Record<string, string | null>) =>
      hrefConParametros(RUTA, { dia: esHoy ? undefined : filtros.dia, medio: filtros.medio ?? undefined, canal: filtros.canal ?? undefined }, cambios);
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <header data-ui="page-header" className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-strong">Ventas del día</h1>
            <LineaDeEstado
              datos={[
                <strong key="d">{diaLargo(filtros.dia)}</strong>,
                `${resumen.cantidad} ${resumen.cantidad === 1 ? "cobrada" : "cobradas"}${hayFiltro ? " con el filtro" : ""}`,
                verPlata && resumen.cantidad > 0 ? (
                  <span key="t">
                    <Plata valor={resumen.total} sinCentavos /> · ticket promedio <Plata valor={resumen.promedio ?? 0} sinCentavos />
                  </span>
                ) : null,
                aCuenta.cantidad > 0 ? `${aCuenta.cantidad} a cuenta` : null,
                anulacionesLeidas.length > 0 ? (
                  <Marca key="a" tipo="atencion">
                    {anulacionesLeidas.length === 1 ? "1 anulación" : `${anulacionesLeidas.length} anulaciones`} {porQuien(anulacionesLeidas.map((a) => a.quien))}
                  </Marca>
                ) : null,
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {verPlata && (
              <PasoDePeriodo
                etiqueta="Día"
                actual={esHoy ? "Hoy" : diaMes(filtros.dia)}
                anterior={{ href: filtroHref({ dia: diaAnterior(filtros.dia) }), texto: diaMes(diaAnterior(filtros.dia)) }}
                siguiente={esHoy ? null : { href: filtroHref({ dia: nextDayKey(filtros.dia) === hoy ? null : nextDayKey(filtros.dia) }), texto: diaMes(nextDayKey(filtros.dia)) }}
                volver={esHoy ? null : { href: filtroHref({ dia: null }), texto: "Hoy" }}
              />
            )}
            {puedeVender && (
              <Link href="/admin/vender" className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                Vender
              </Link>
            )}
          </div>
        </header>

        {anulacionesLeidas.length > 0 && (
          <details className="group mb-4 max-w-3xl">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-line text-sm font-semibold text-strong">
              Quién anuló y por qué{verPlata ? ` · ${fmtMoneyARS(montoAnulado)} devueltos` : ""}
              <span aria-hidden className="text-muted group-open:rotate-90">
                ›
              </span>
            </summary>
            {anulacionesLeidas.map((a, i) => (
              <Renglon
                key={i}
                folio={a.code != null ? `#${a.code}` : "—"}
                titulo={a.quien}
                detalle={a.motivo || "sin motivo escrito"}
                plata={verPlata ? <Plata valor={a.monto} /> : undefined}
              />
            ))}
          </details>
        )}

        <nav data-ui="filtros" aria-label="Filtrar las ventas">
          <span className="flex flex-wrap gap-1.5" role="group" aria-label="Medio">
            {[{ valor: null, etiqueta: "Todos los medios" }, ...MEDIOS_DE_COBRO].map((m) => (
              <Link key={m.etiqueta} href={filtroHref({ medio: m.valor })} scroll={false} {...chipLinkAtributos((filtros.medio ?? null) === m.valor)}>
                {m.etiqueta}
              </Link>
            ))}
          </span>
          <span className="flex flex-wrap gap-1.5" role="group" aria-label="Canal">
            {([
              [null, "Mostrador y pedidos"],
              ["COUNTER", "Mostrador"],
              ["ONLINE", "Pedidos"],
            ] as const).map(([c, etiqueta]) => (
              <Link key={etiqueta} href={filtroHref({ canal: c })} scroll={false} {...chipLinkAtributos((filtros.canal ?? null) === c)}>
                {etiqueta}
              </Link>
            ))}
          </span>
        </nav>

        <TablaDeVentas
          filas={filas}
          negocio={negocio}
          vacio={
            <span className="flex flex-wrap items-center gap-3">
              {vacio.titulo}. {vacio.descripcion}
              {vacio.accion && (
                <Link href={destinoVacio[vacio.accion.destino]} className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")}>
                  {vacio.accion.etiqueta}
                </Link>
              )}
            </span>
          }
        />
        {(vigentes.length === LIMITE || anuladas.length === LIMITE) && (
          <p className="mt-3 text-sm text-muted">Se muestran las últimas {LIMITE}. Filtrá por medio o por canal para ver el resto.</p>
        )}
      </main>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Ventas del día"
        description={
          alcance?.soloHoy
            ? "Las ventas cobradas de hoy. Para corregir una pesada, anulala con el motivo y volvé a cobrarla."
            : "Las ventas cobradas. Para corregir una, anulala con el motivo y volvé a cobrarla."
        }
        actions={
          puedeVender ? (
            <Link href="/admin/vender" className={buttonClasses("solid", "md")}>
              Vender
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3" aria-label="Filtrar las ventas">
        {verPlata && (
          <label className="text-sm">
            <span className="mb-1 block text-muted">Día</span>
            <input
              type="date"
              name="dia"
              defaultValue={filtros.dia}
              max={hoy}
              className="h-11 rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            />
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block text-muted">Medio</span>
          <Select name="medio" defaultValue={filtros.medio ?? ""} className="w-44">
            <option value="">Todos</option>
            {MEDIOS_DE_COBRO.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Canal</span>
          <Select name="canal" defaultValue={filtros.canal ?? ""} className="w-40">
            <option value="">Todos</option>
            <option value="COUNTER">Mostrador</option>
            <option value="ONLINE">Pedidos</option>
          </Select>
        </label>
        <button type="submit" className={buttonClasses("outline", "md")}>
          Ver
        </button>
      </form>

      <section aria-label="Resumen" className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Ventas cobradas {cuando}{hayFiltro ? " (con el filtro)" : ""}</p>
          <p className="text-2xl font-semibold tabular-nums text-strong">{resumen.cantidad}</p>
          {verPlata && (
            <p className="text-sm text-muted tabular-nums">
              {resumen.cantidad > 0
                ? `Total ${fmtMoneyARS(resumen.total)} · ticket promedio ${fmtMoneyARS(resumen.promedio)}`
                : "Sin ventas, no hay ticket promedio"}
            </p>
          )}
          {aCuenta.cantidad > 0 && (
            <p className="text-sm text-muted tabular-nums">
              {aCuenta.cantidad === 1 ? "1 quedó a cuenta" : `${aCuenta.cantidad} quedaron a cuenta`}
              {verPlata && ` (${fmtMoneyARS(aCuenta.total)}): su plata no entró al libro`}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Anulaciones hechas {cuando}</p>
          <p className="text-2xl font-semibold tabular-nums text-strong">{anulacionesLeidas.length}</p>
          {anulacionesLeidas.length > 0 && (
            <p className="text-sm text-muted">
              {porQuien(anulacionesLeidas.map((a) => a.quien))}
              {verPlata && ` · ${fmtMoneyARS(montoAnulado)} devueltos`}
            </p>
          )}
          {anulacionesLeidas.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-faint">
              {anulacionesLeidas.map((a, i) => (
                <li key={i}>
                  {a.code != null ? `#${a.code} · ` : ""}
                  {a.quien}
                  {a.motivo ? `: ${a.motivo}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {lista.length === 0 ? (
        // La lista vacía dice qué hacer y trae el botón (vacioDeVentas, filtros.ts).
        <EmptyState
          title={vacio.titulo}
          description={vacio.descripcion}
          action={
            vacio.accion ? (
              <Link
                href={destinoVacio[vacio.accion.destino]}
                className={buttonClasses(vacio.accion.destino === "vender" ? "solid" : "outline", "md")}
              >
                {vacio.accion.etiqueta}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {lista.map((o) => {
              const venta = ventaDeOrden(o);
              return (
                <FilaVenta
                  key={o.id}
                  venta={venta}
                  hora={fmtTime(o.createdAt)}
                  canal={o.channel}
                  negocio={negocio}
                  anular={venta.anulada ? null : anulaEsteDia}
                  notas={notasDe(o)}
                  factura={puedeFacturar && !venta.anulada ? (facturaDe.get(o.id) ?? SIN_FACTURA) : null}
                />
              );
            })}
          </ul>
          {(vigentes.length === LIMITE || anuladas.length === LIMITE) && (
            <p className="mt-3 text-xs text-muted">
              Se muestran las últimas {LIMITE}. Usá el filtro de medio o de canal para ver el resto.
            </p>
          )}
        </>
      )}
    </PageContainer>
  );
}
