// ============================================================================
// «HOY» DEL NEGOCIO — el lector (venta-agenda-simple, T1). SÓLO LECTURA.
// ============================================================================
//
// Lee lo que arma `hoy-core.ts`. Recibe el `tenantId` (no lo resuelve: lo pasa el Inicio, que ya
// pasó por la guardia) y filtra por él en TODA consulta además de RLS (lecciones MT-1/MT-5). Cada
// parte va en su propia `tenantTransaction` y su propio `catch`: si una falla, esa parte llega
// `null` («No se pudo leer») y las otras siguen; en una sola transacción, la primera falla
// abortaría las demás.
//
// El día es el del negocio (`todayInBusinessTz`, el mismo que usa el cierre), de 00:00 a 00:00.
// Lo cobrado usa el mismo `select` del cierre (`cierre-diario-actions.ts` SELECT_DEL_PERIODO:
// `collection.method` y `order.paymentMethod`), acotado a lo que la tarjeta necesita. No filtra
// por DEBITO/CREDITO en el `where`: sin el paquete Gate 2 la base no conoce esos valores.

import { tenantTransaction } from "@/lib/rls";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { nextDayKey } from "@/lib/caja/cierre-diario";
import { ACCION_SENIA_PEDIDA } from "@/lib/turnos/senia-pedida";
import { armarHoy, type LecturaDelHoy, type MovimientoDelHoy, type TarjetaHoy, type TurnoConSenia } from "./hoy-core";

/** Tope de turnos que mira para las señas (hoy + mañana); más es otra pantalla, la agenda. */
const TOPE_DE_TURNOS = 300;
/** Tope de filas del libro de un día. */
const TOPE_DE_MOVIMIENTOS = 2_000;

async function intentar<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error("[hoy-del-negocio] una parte no se pudo leer:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Lo que lee el lector, crudo (para el test de aislamiento y para `leerHoyDelNegocio`). */
export async function leerLecturaDelHoy(tenantId: string, dia: string = todayInBusinessTz()): Promise<LecturaDelHoy> {
  if (!tenantId) throw new Error("hoy-del-negocio: falta el negocio");
  const manana = nextDayKey(dia);
  const desde = businessWallTimeToUtc(dia, "00:00");
  const hasta = businessWallTimeToUtc(manana, "00:00");
  const pasado = businessWallTimeToUtc(nextDayKey(manana), "00:00");
  const enTx = <T>(fn: Parameters<typeof tenantTransaction<T>>[0]) => intentar(() => tenantTransaction(fn, { tenantId }));

  const [turnos, movimientos, ventas, senias] = await Promise.all([
    enTx(async (tx) => {
      const filas = await tx.appointment.groupBy({
        by: ["status"],
        where: { tenantId, startsAt: { gte: desde, lt: hasta } },
        _count: { _all: true },
      });
      return filas.map((f) => ({ status: String(f.status), cantidad: f._count._all }));
    }),
    enTx(async (tx): Promise<MovimientoDelHoy[]> => {
      const filas = await tx.cashMovement.findMany({
        where: { tenantId, occurredAt: { gte: desde, lt: hasta }, type: { in: ["VENTA", "INGRESO", "EGRESO"] } },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        take: TOPE_DE_MOVIMIENTOS,
        select: {
          type: true,
          method: true,
          amount: true,
          orderId: true,
          collectionId: true,
          collection: { select: { method: true } },
          order: { select: { paymentMethod: true } },
        },
      });
      return filas.map((f) => ({
        type: String(f.type),
        method: String(f.method),
        amount: Number(f.amount),
        orderId: f.orderId,
        collectionId: f.collectionId,
        medioDeOrigen: f.collection?.method ?? f.order?.paymentMethod ?? null,
      }));
    }),
    enTx(async (tx) => {
      const r = await tx.order.aggregate({
        where: { tenantId, createdAt: { gte: desde, lt: hasta }, status: { not: "CANCELLED" } },
        _count: { _all: true },
        _sum: { total: true },
      });
      return { cantidad: r._count._all, total: Number(r._sum.total ?? 0) };
    }),
    enTx(async (tx): Promise<TurnoConSenia[]> => {
      const lista = await tx.appointment.findMany({
        where: { tenantId, startsAt: { gte: desde, lt: pasado }, status: { in: ["PENDING", "CONFIRMED"] } },
        orderBy: { startsAt: "asc" },
        take: TOPE_DE_TURNOS,
        select: {
          id: true,
          startsAt: true,
          priceAtBooking: true,
          client: { select: { name: true } },
          service: { select: { name: true, price: true, depositAmount: true } },
          collections: { where: { tenantId }, select: { amount: true } },
        },
      });
      if (lista.length === 0) return [];
      const marcas = await tx.auditLog.findMany({
        where: { tenantId, entity: "Appointment", action: ACCION_SENIA_PEDIDA, entityId: { in: lista.map((t) => t.id) } },
        select: { entityId: true },
      });
      const pedidas = new Set(marcas.map((m) => m.entityId));
      return lista.map((t) => ({
        id: t.id,
        startsAt: t.startsAt,
        clienta: t.client.name,
        servicio: t.service.name,
        precio: t.priceAtBooking ?? t.service.price,
        depositAmount: t.service.depositAmount,
        cobrado: t.collections.reduce((a, c) => a + Number(c.amount), 0),
        pedida: pedidas.has(t.id),
      }));
    }),
  ]);
  return { turnos, movimientos, ventas, senias };
}

/** La tarjeta «Hoy» de este negocio. */
export async function leerHoyDelNegocio(tenantId: string, dia?: string): Promise<TarjetaHoy> {
  return armarHoy(await leerLecturaDelHoy(tenantId, dia));
}
