// ============================================================================
// CIERRE DEL MES — lo que se lee de la base para armar los ocho pasos. SERVIDOR.
// ============================================================================
//
// Una consulta por dato, todas por `tenantId` explícito y con la base que se le pasa: la del
// request para la pantalla, o la transacción de OTRO negocio para la cartera del contador.
// Sin "use server": recibe un tenantId, y en un archivo así cada export sería un endpoint
// que lee el cierre de cualquier negocio.
//
// Las tablas que pueden no estar en una base (el extracto del banco tiene su migración sin
// medir en Neon) se leen tolerando "tabla inexistente" (P2021) y el paso queda "no aplica".
// Por eso la pantalla lee con el cliente del request y NO dentro de una transacción: en
// Postgres un error adentro de una transacción la aborta entera.

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { lastClosedDayTx } from "@/lib/caja/frontera-cierre";
import { isPrismaError } from "@/lib/prisma-errors";
import { whereAnuladasConFactura } from "@/lib/libros/libro-iva";
import { bordesDelMes, type MesKey } from "@/lib/libros/fecha-fiscal";
import { consultaAuditoriaCierre, type HechosCierreMes, type RegistroCierre } from "./cierre-mes";
import { contarComisionesDelMes } from "./comisiones";
// El AJUSTE de un recuento se reconoce por el motivo que le pone la app de Recuento: la misma
// constante que usan la planilla y el botón de Recuento (no hay columna para distinguirlo).
import { MOTIVO_RECUENTO } from "@/lib/inventario/recuento";

/** La base con la que se lee: el cliente del request o una transacción del negocio. */
export type DbCierre = Prisma.TransactionClient;


/** Las filas de auditoría del cierre de un mes. Sólo las acciones del cierre: nada forjado. */
export async function leerAuditoriaCierre(db: DbCierre, tenantId: string, mes: MesKey): Promise<RegistroCierre[]> {
  return db.auditLog.findMany(consultaAuditoriaCierre(tenantId, mes));
}

/** Lee con tolerancia a "la tabla no existe en esta base": devuelve `null` en ese caso. */
async function siExisteLaTabla<T>(leer: () => Promise<T>): Promise<T | null> {
  try {
    return await leer();
  } catch (e) {
    if (isPrismaError(e, "P2021") || isPrismaError(e, "P2022")) return null;
    throw e;
  }
}

/** Los hechos del mes para los ocho pasos. */
export async function leerHechosCierreMes(
  db: DbCierre,
  tenantId: string,
  mes: MesKey,
  opts: { esMostrador: boolean },
): Promise<HechosCierreMes> {
  const b = bordesDelMes(mes);
  const enElMes = { gte: b.instantes.gte, lt: b.instantes.lt };

  const [
    cerradoHasta,
    movimientoDeCaja,
    porEstado,
    anuladasConFactura,
    compras,
    comprasSinProveedor,
    extracto,
    comisiones,
    recuento,
  ] = await Promise.all([
    lastClosedDayTx(db, tenantId),
    db.cashMovement.findFirst({ where: { tenantId, occurredAt: { lt: b.instantes.lt } }, select: { id: true } }),
    db.invoice.groupBy({
      by: ["status"],
      where: { tenantId, fecha: { gte: b.fiscal.gte, lt: b.fiscal.lt } },
      _count: { _all: true },
    }),
    db.invoice.count({ where: whereAnuladasConFactura(tenantId, { fecha: b.fiscal }) }),
    db.stockPurchase.count({ where: { tenantId, kind: "COMPRA", createdAt: enElMes } }),
    db.stockPurchase.count({ where: { tenantId, kind: "COMPRA", createdAt: enElMes, supplierId: null } }),
    siExisteLaTabla(async () => {
      const usa = await db.importacionBancaria.findFirst({ where: { tenantId }, select: { id: true } });
      if (!usa) return null;
      const agg = await db.movimientoImportado.aggregate({
        where: { tenantId, fecha: { gte: b.fiscal.gte, lt: b.fiscal.lt } },
        _count: { _all: true },
        _max: { fecha: true },
      });
      return { movimientosDelMes: agg._count._all, ultimaFecha: agg._max.fecha ?? null };
    }),
    // Comisiones: sólo en servicios y si alguna profesional cobra comisión. "Pendiente" es lo
    // que la liquidación (commission-actions.ts) PUEDE liquidar: mismo `where` (realizado,
    // cobrado y sin liquidar) y las mismas dos reglas (`contarComisionesDelMes`): el turno con
    // saldo por cobrar espera, y el que da 0% no se liquida nunca. El turno cuenta en el mes
    // en que se atendió.
    opts.esMostrador
      ? Promise.resolve(null)
      : (async () => {
          const conComision = await db.professional.count({
            where: {
              tenantId,
              OR: [
                { commissionPercent: { gt: 0 } },
                { serviceCommissions: { some: { commissionPercent: { gt: 0 } } } },
              ],
            },
          });
          if (conComision === 0) return null;
          const [turnos, profesionales, porServicio] = await Promise.all([
            db.appointment.findMany({
              where: {
                tenantId,
                status: "COMPLETED",
                commissionPayoutId: null,
                payment: { status: "APPROVED" },
                startsAt: enElMes,
              },
              select: {
                professionalId: true,
                serviceId: true,
                priceAtBooking: true,
                service: { select: { price: true } },
                payment: { select: { status: true, amount: true } },
                collections: { select: { amount: true, method: true } },
              },
            }),
            db.professional.findMany({ where: { tenantId }, select: { id: true, commissionPercent: true } }),
            db.professionalServiceCommission.findMany({
              where: { tenantId },
              select: { professionalId: true, serviceId: true, commissionPercent: true },
            }),
          ]);
          const overrides = new Map<string, Map<string, number>>();
          for (const o of porServicio) {
            const m = overrides.get(o.professionalId) ?? new Map<string, number>();
            m.set(o.serviceId, o.commissionPercent);
            overrides.set(o.professionalId, m);
          }
          return contarComisionesDelMes(
            turnos.map((t) => ({
              professionalId: t.professionalId,
              serviceId: t.serviceId,
              precio: t.priceAtBooking ?? t.service.price,
              cobros: t.collections.map((c) => ({ amount: c.amount.toNumber(), method: c.method })),
              pagoLegado: t.payment,
            })),
            new Map(profesionales.map((p) => [p.id, p.commissionPercent])),
            overrides,
          );
        })(),
    // Recuento: sólo si el negocio controla stock de algún producto activo.
    (async () => {
      const conStock = await db.product.count({ where: { tenantId, active: true, deletedAt: null, trackStock: true } });
      if (conStock === 0) return null;
      const recuentosDelMes = await db.stockMovement.count({
        where: { tenantId, type: "AJUSTE", reason: { startsWith: MOTIVO_RECUENTO }, createdAt: enElMes },
      });
      return { recuentosDelMes };
    })(),
  ]);

  const cuenta = (s: string) => porEstado.find((g) => g.status === s)?._count._all ?? 0;
  return {
    mes,
    caja: { usaCaja: movimientoDeCaja !== null, cerradoHasta },
    comprobantes: {
      total: porEstado.reduce((s, g) => s + g._count._all, 0),
      sinCae: cuenta("PENDING"),
      rechazados: cuenta("REJECTED"),
    },
    anuladasConFactura,
    extracto,
    compras: { total: compras, sinProveedor: comprasSinProveedor },
    comisiones,
    recuento,
  };
}
