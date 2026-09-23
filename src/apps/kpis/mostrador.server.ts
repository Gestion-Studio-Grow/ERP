// ============================================================================
// NÚMEROS DEL MOSTRADOR — Pedidos y Ventas de hoy.
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
import { wherePedidosAbiertos } from "@/lib/order-anulacion";
import { fmtMoneyARS, fmtNumberAR } from "@/components/ui/format";
import { plural, type LoaderKpi } from "./nucleo.server";

// ── Pedidos para preparar ────────────────────────────────────────────────────

/**
 * "3 abiertos", y en alerta los entregados sin cobrar: la mercadería salió y la plata no
 * entró. El `where` es el de la bandeja (`wherePedidosAbiertos`, order-anulacion.ts, el
 * mismo que usa `getPosData`): lo que el tile cuenta es exactamente lo que la bandeja
 * lista con botones, y la bandeja dice "(3 abiertos)" en su título.
 */
export const pedidos: LoaderKpi = async ({ db, tenantId }) => {
  const grupos = await db.order.groupBy({
    by: ["status", "paid"],
    where: wherePedidosAbiertos(tenantId),
    _count: { _all: true },
  });
  const { abiertos, entregadosSinCobrar } = resumirPedidos(grupos);
  return {
    valor: fmtNumberAR(abiertos),
    detalle: plural(abiertos, "abierto", "abiertos"),
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

/** Suma los grupos de la bandeja. Entregado sin cobrar = DELIVERED con paid=false. PURA. */
export function resumirPedidos(
  grupos: readonly { status: string; paid: boolean; _count: { _all: number } }[],
): { abiertos: number; entregadosSinCobrar: number } {
  let abiertos = 0;
  let entregadosSinCobrar = 0;
  for (const g of grupos) {
    abiertos += g._count._all;
    if (g.status === "DELIVERED" && !g.paid) entregadosSinCobrar += g._count._all;
  }
  return { abiertos, entregadosSinCobrar };
}

// ── Ventas de hoy ────────────────────────────────────────────────────────────

/**
 * Las ventas COBRADAS de hoy: `paid` en true, no anuladas, creadas desde las 00:00 del día
 * del negocio. El Inicio de mostrador de antes (`getRetailDashboardData`, actions.ts) contaba
 * todo pedido no anulado, cobrado o no: un pedido online sin pagar sumaba como venta del día
 * y "Ingresos hoy" mostraba plata que nunca entró. PURA.
 */
export function whereVentasDeHoy(tenantId: string, desde: Date): Prisma.OrderWhereInput {
  return { tenantId, paid: true, status: { not: "CANCELLED" }, createdAt: { gte: desde } };
}

/**
 * "42 ventas cobradas hoy · $1.230.000". El monto, sólo con reports:read; sin él ni se suma.
 * Es el número de la app Vender, que se registra en la ola 2 (hoy vender es una solapa de
 * Pedidos): el loader queda listo con su regla probada para que esa app lo tome tal cual.
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

export const LOADERS_MOSTRADOR: Readonly<Record<string, LoaderKpi>> = { pedidos, vender };
