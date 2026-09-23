import Link from "next/link";
import { requireApp } from "@/lib/require-app";
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
import { leerFiltros, notaDeDescuento, resumenDeVentas } from "./filtros";
import { ventaDeOrden } from "../vender/reglas-venta";

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
  const esHoy = filtros.dia === hoy;

  // Hoy: desde las 00:00 sin tope (el MISMO `where` que el número del Inicio). Otro día: ese día.
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
      const manos = Array.isArray(c.preciosAMano) ? (c.preciosAMano as { nombre?: unknown; motivo?: unknown }[]) : [];
      for (const m of manos) {
        if (typeof m.nombre === "string") {
          out.push(`Precio a mano en «${m.nombre}»${typeof m.motivo === "string" ? `: ${m.motivo}` : ""}.`);
        }
      }
    }
    return out;
  };

  const resumen = resumenDeVentas(vigentes);
  const anulacionesLeidas = anulacionesDelDia.map((f) => leerAnulacion(f, nombres));
  const montoAnulado = anulacionesLeidas.reduce((s, a) => s + a.monto, 0);
  const lista = [...vigentes, ...anuladas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const cuando = esHoy ? "hoy" : `el ${fmtShortDate(desde)}`;
  // Recepción anula sólo lo de hoy (el servidor lo vuelve a exigir en `anularVenta`).
  const anulaEsteDia = alcance && (!alcance.soloHoy || esHoy) ? { motivoObligatorio: alcance.motivoObligatorio } : null;
  const hayFiltro = filtros.medio !== null || filtros.canal !== null;

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
        <EmptyState
          title={`No hay ventas cobradas ${cuando}${hayFiltro ? " con ese filtro" : ""}`}
          description={
            hayFiltro
              ? "Probá con «Todos» en medio y canal."
              : "Las ventas que se cobran en el mostrador y los pedidos cobrados aparecen acá."
          }
          action={
            hayFiltro ? (
              <Link href={esHoy ? "/admin/ventas" : `/admin/ventas?dia=${filtros.dia}`} className={buttonClasses("outline", "md")}>
                Sacar el filtro
              </Link>
            ) : puedeVender ? (
              <Link href="/admin/vender" className={buttonClasses("solid", "md")}>
                Ir a Vender
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
