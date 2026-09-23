// ============================================================================
// NÚMEROS DEL MOSTRADOR — Vender, Pedidos y Ventas del día.
// ============================================================================
//
// Reglas de todos los loaders de src/apps/kpis (valen para este archivo y sus vecinos):
//   · UNA operación de base por número (count, aggregate, groupBy o una lectura acotada),
//     con el `db` que llega en el contexto: es el cliente global del request, y cada
//     operación lleva su negocio. Nada de transacciones acá: con RLS encendido, una lectura
//     del cliente global adentro de una transacción sale por otra conexión sin el negocio
//     puesto y devuelve 0 sin error (rls.ts). Un test ejecuta cada loader y cuenta.
//   · El `where` sale de la PANTALLA, no se reescribe: si el tile dijera 3 y la bandeja
//     mostrara 4, el Inicio mentiría. Cuando la pantalla todavía no lo exporta, se copia
//     tal cual citando la función de origen, y el paso siguiente es que la pantalla lo
//     exporte y este archivo lo importe.
//   · Nunca una caché entre requests: sin el negocio en la clave, un negocio vería los
//     números de otro. Un test lo prohíbe en toda la carpeta.

import type { Prisma } from "@/generated/prisma/client";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { nextDayKey } from "@/lib/caja/cierre-diario";
import {
  wherePedidosAbiertos,
  whereVentasCobradas,
  whereAnulacionesDelDia,
  resumirAnulaciones,
  porQuien,
} from "@/lib/order-anulacion";
import { fmtMoneyARS, fmtNumberAR } from "@/components/ui/format";
import { plural, type DatoKpi, type LoaderKpi } from "./nucleo.server";

// ── Pedidos para preparar ────────────────────────────────────────────────────

/**
 * "3 abiertos · 1 para hoy", y en alerta los entregados sin cobrar: la mercadería salió y la
 * plata no entró. El `where` es el de la bandeja (`wherePedidosAbiertos`, order-anulacion.ts,
 * el mismo que usa `getPosData`): lo que el tile cuenta es exactamente lo que la bandeja lista
 * con botones, y la bandeja dice "(3 abiertos)" en su título.
 *
 * "Para hoy" sale en la MISMA consulta: se agrupa también por el horario pedido y se cuentan
 * los que caen hoy en la zona del negocio (la bandeja los marca "Retira hoy …").
 */
export const pedidos: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const grupos = await db.order.groupBy({
    by: ["status", "paid", "scheduledFor"],
    where: wherePedidosAbiertos(tenantId),
    _count: { _all: true },
  });
  const { abiertos, entregadosSinCobrar, paraHoy } = resumirPedidos(grupos, rangoDelDia(hoy));
  return {
    valor: fmtNumberAR(abiertos),
    detalle: plural(abiertos, "abierto", "abiertos") + (paraHoy > 0 ? ` · ${fmtNumberAR(paraHoy)} para hoy` : ""),
    ...(entregadosSinCobrar > 0
      ? {
          alerta: {
            valor: fmtNumberAR(entregadosSinCobrar),
            texto: plural(entregadosSinCobrar, "entregado sin cobrar", "entregados sin cobrar"),
          },
        }
      : {}),
  };
};

/** Desde las 00:00 de `hoy` hasta las 00:00 del día siguiente, en la zona del negocio. */
function rangoDelDia(hoy: string): { desde: Date; hasta: Date } {
  return { desde: businessWallTimeToUtc(hoy, "00:00"), hasta: businessWallTimeToUtc(nextDayKey(hoy), "00:00") };
}

/**
 * Suma los grupos de la bandeja. PURA.
 *   · entregado sin cobrar = DELIVERED con paid=false;
 *   · para hoy = todavía en curso (no entregado) con horario pedido dentro de `hoy`.
 */
export function resumirPedidos(
  grupos: readonly { status: string; paid: boolean; scheduledFor?: Date | string | null; _count: { _all: number } }[],
  hoy?: { desde: Date; hasta: Date },
): { abiertos: number; entregadosSinCobrar: number; paraHoy: number } {
  let abiertos = 0;
  let entregadosSinCobrar = 0;
  let paraHoy = 0;
  for (const g of grupos) {
    abiertos += g._count._all;
    if (g.status === "DELIVERED" && !g.paid) entregadosSinCobrar += g._count._all;
    if (hoy && g.status !== "DELIVERED" && g.scheduledFor) {
      const t = new Date(g.scheduledFor).getTime();
      if (t >= hoy.desde.getTime() && t < hoy.hasta.getTime()) paraHoy += g._count._all;
    }
  }
  return { abiertos, entregadosSinCobrar, paraHoy };
}

// ── Ventas de hoy ────────────────────────────────────────────────────────────

/**
 * Las ventas COBRADAS de hoy: `paid` en true, no anuladas, creadas desde las 00:00 del día
 * del negocio. El Inicio de mostrador de antes (`getRetailDashboardData`, actions.ts) contaba
 * todo pedido no anulado, cobrado o no: un pedido online sin pagar sumaba como venta del día
 * y "Ingresos hoy" mostraba plata que nunca entró. PURA.
 */
export function whereVentasDeHoy(tenantId: string, desde: Date): Prisma.OrderWhereInput {
  // El mismo `where` que la lista de Ventas del día (/admin/ventas) para hoy.
  return whereVentasCobradas(tenantId, desde);
}

/**
 * "42 ventas cobradas hoy · $1.230.000". El monto, sólo con reports:read; sin él ni se suma.
 * Es el número de la app Vender (/admin/vender).
 */
export const vender: LoaderKpi = async ({ db, tenantId, hoy, monto }) => {
  const where = whereVentasDeHoy(tenantId, businessWallTimeToUtc(hoy, "00:00"));
  if (!monto) {
    const n = await db.order.count({ where });
    return { valor: fmtNumberAR(n), detalle: plural(n, "venta cobrada hoy", "ventas cobradas hoy") };
  }
  const r = await db.order.aggregate({ where, _count: { _all: true }, _sum: { total: true } });
  const n = r._count._all;
  return {
    valor: fmtNumberAR(n),
    detalle: plural(n, "venta cobrada hoy", "ventas cobradas hoy"),
    monto: fmtMoneyARS(r._sum.total ?? 0, 0),
  };
};

// ── Ventas del día ───────────────────────────────────────────────────────────

/**
 * "2 · anulaciones hoy, por Juan · $31.000 anulados". El control de las anulaciones es por
 * VISIBILIDAD: recepción anula lo de hoy sin pedirle la clave a nadie (trabar la corrección
 * de una pesada un sábado con cola es peor), y la dueña ve acá quién anuló y cuánto.
 *
 * UNA consulta: las filas de auditoría de las anulaciones hechas hoy (`whereAnulacionesDelDia`,
 * el mismo `where` que la sección "Anuladas hoy" de /admin/ventas). El nombre de quien anuló
 * viaja en la fila (`por`), así no hace falta cruzar con los usuarios. El ticket promedio no
 * entra en el tile por eso mismo: sale de otra tabla y serían dos consultas; está en la pantalla.
 */
export const ventasDelDia: LoaderKpi = async ({ db, tenantId, hoy, monto }) => {
  const filas = await db.auditLog.findMany({
    where: whereAnulacionesDelDia(tenantId, businessWallTimeToUtc(hoy, "00:00")),
    select: { entityId: true, actor: true, changes: true },
    take: 500,
  });
  return datoDeAnulaciones(resumirAnulaciones(filas), monto);
};

/** El número del tile a partir del resumen. Sin anulaciones es un 0 real, no falta de dato. PURA. */
export function datoDeAnulaciones(
  r: { cantidad: number; monto: number; quienes: string[] },
  monto: boolean,
): DatoKpi {
  if (r.cantidad === 0) return { valor: "0", detalle: "anulaciones hoy" };
  return {
    valor: fmtNumberAR(r.cantidad),
    detalle: `${plural(r.cantidad, "anulación hoy", "anulaciones hoy")}, ${porQuien(r.quienes)}`,
    ...(monto ? { monto: `${fmtMoneyARS(r.monto, 0)} ${plural(r.cantidad, "anulado", "anulados")}` } : {}),
  };
}

export const LOADERS_MOSTRADOR: Readonly<Record<string, LoaderKpi>> = {
  pedidos,
  vender,
  "ventas-del-dia": ventasDelDia,
};
