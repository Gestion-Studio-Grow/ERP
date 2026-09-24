// ============================================================================
// LECTURA del resultado del mes — los hechos que `calcularResultado` necesita, leídos una vez.
// ============================================================================
//
// La usan la pantalla (/admin/resultado) y la app Margen (lo vendido en el mes): la MISMA
// función, así los dos cierran entre sí. El botón del Inicio va sin número: son seis consultas
// y la regla de los números del Inicio pide una (si plataforma decide la excepción, el loader
// sale de acá y no de otra cuenta).
//
// Recibe la base y el negocio; no los decide. Sin "use server" (sería un endpoint que lee el
// resultado de cualquier tenantId) y sin "server-only" (la ejecutan los tests en node).
//
// CUÁNTAS CONSULTAS: seis en paralelo y, sólo si alguna línea vendida no guardó su costo, una
// séptima con el costo de hoy de esos productos. Cada una es de un tipo de hecho distinto
// (condición fiscal, pedidos, pedidos a cuenta, salidas de stock, turnos cobrados, libro de
// caja) y ninguna se puede derivar de otra sin inventar un dato.
//
// Columnas que pueden faltar en la base (migraciones pendientes): del libro sólo se leen
// `type`, `amount`, `createdBy`, `orderId` y `occurredAt`, que existen desde antes del lote;
// `collectionId` y `paymentId` NO se nombran (el resultado no necesita la referencia).

import type { Prisma } from "@/generated/prisma/client";
import { SELECT_INGRESOS, costosVigentesDe } from "@/lib/stock/costo";
import { bordesDelMes, type MesKey } from "@/lib/libros/fecha-fiscal";
import { condicionPorTipos, whereComprobantesEmitidos, type CondicionLibro } from "@/lib/libros/libro-iva";
import { aNumero } from "@/lib/debts/resumen-cuentas";
import { calcularResultado, type HechosDelMes, type MovimientoDeCaja, type ResultadoDelMes } from "./resultado";
import type { PedidoDelPeriodo, SalidaDeStock } from "./costo-vendido";

export type DbReportes = Prisma.TransactionClient;

/** Los pedidos NO anulados creados en el mes (cobrados o no: decide `pedidosQueSonVenta`). */
export function wherePedidosDelMes(tenantId: string, mes: MesKey) {
  const { instantes } = bordesDelMes(mes);
  return { tenantId, status: { not: "CANCELLED" as const }, createdAt: { gte: instantes.gte, lt: instantes.lt } };
}

/**
 * Las cuentas a cobrar vivas que salieron de un pedido del mes (la venta "a cuenta",
 * order-core.ts: la deuda nace en la MISMA transacción que el pedido, milisegundos después).
 * El corte de arriba se estira un día: un pedido de las 23:59:59,999 del último día tiene su
 * cuenta en el mes siguiente. Las cuentas de más no molestan: sólo se miran las de los
 * pedidos del mes.
 */
export function whereFiadosDePedidosDelMes(tenantId: string, mes: MesKey) {
  const { instantes } = bordesDelMes(mes);
  const hasta = new Date(instantes.lt.getTime() + 86_400_000);
  return { tenantId, status: "OPEN" as const, orderId: { not: null }, createdAt: { gte: instantes.gte, lt: hasta } };
}

/** Las salidas de stock del mes que son costo de lo vendido: ventas y consumos de servicios. */
export function whereSalidasDelMes(tenantId: string, mes: MesKey) {
  const { instantes } = bordesDelMes(mes);
  return { tenantId, type: { in: ["VENTA" as const, "CONSUMO" as const] }, createdAt: { gte: instantes.gte, lt: instantes.lt } };
}

/** Los turnos cobrados en el mes, por fecha de COBRO (el reloj de Reportes). */
export function whereTurnosCobradosDelMes(tenantId: string, mes: MesKey) {
  const { instantes } = bordesDelMes(mes);
  return { tenantId, status: "APPROVED" as const, createdAt: { gte: instantes.gte, lt: instantes.lt } };
}

/** Los movimientos del libro de caja con fecha CONTABLE en el mes (el mismo corte que el libro). */
export function whereCajaDelMes(tenantId: string, mes: MesKey) {
  const { instantes } = bordesDelMes(mes);
  return { tenantId, occurredAt: { gte: instantes.gte, lt: instantes.lt } };
}

/** La condición fiscal deducida de lo emitido (A/B inscripto, sólo C monotributo). */
export async function leerCondicion(db: DbReportes, tenantId: string): Promise<CondicionLibro> {
  const grupos = await db.invoice.groupBy({
    by: ["tipoComprobante"],
    where: whereComprobantesEmitidos(tenantId),
    _count: { _all: true },
  });
  return condicionPorTipos(grupos.map((g) => g.tipoComprobante));
}

/** Los hechos del mes. `costosDelCatalogo`: el costo fijado a mano (Product.cost), si se leyó. */
export async function leerHechosDelMes(
  db: DbReportes,
  tenantId: string,
  mes: MesKey,
  opts: { costosDelCatalogo?: ReadonlyMap<string, number>; comercio?: boolean } = {},
): Promise<HechosDelMes> {
  const [condicion, pedidos, fiados, salidas, turnos, caja] = await Promise.all([
    leerCondicion(db, tenantId),
    db.order.findMany({
      where: wherePedidosDelMes(tenantId, mes),
      select: {
        id: true,
        total: true,
        paid: true,
        items: { select: { productId: true, name: true, quantity: true, saleUnit: true, lineTotal: true } },
      },
    }),
    db.accountReceivable.findMany({
      where: whereFiadosDePedidosDelMes(tenantId, mes),
      select: { orderId: true },
    }).catch((e: unknown) => {
      // Sin la tabla de cuentas corrientes no hay ventas a cuenta que sumar: el resto del
      // resultado se calcula igual.
      if ((e as { code?: unknown } | null)?.code === "P2021") return [] as { orderId: string | null }[];
      throw e;
    }),
    db.stockMovement.findMany({
      where: whereSalidasDelMes(tenantId, mes),
      select: { type: true, orderId: true, productId: true, qty: true, unitCost: true },
    }),
    db.payment.aggregate({
      where: whereTurnosCobradosDelMes(tenantId, mes),
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.cashMovement.findMany({
      where: whereCajaDelMes(tenantId, mes),
      select: { type: true, amount: true, createdBy: true, orderId: true },
    }),
  ]);

  const pedidosDelMes: PedidoDelPeriodo[] = pedidos.map((p) => ({
    id: p.id,
    total: aNumero(p.total),
    paid: p.paid,
    items: (p.items ?? []).map((i) => ({
      productId: i.productId,
      nombre: i.name,
      cantidad: aNumero(i.quantity),
      saleUnit: i.saleUnit === "WEIGHT" ? ("WEIGHT" as const) : ("UNIT" as const),
      importe: aNumero(i.lineTotal),
    })),
  }));
  const salidasDelMes: SalidaDeStock[] = salidas.map((s) => ({
    type: s.type === "CONSUMO" ? "CONSUMO" : "VENTA",
    orderId: s.orderId,
    productId: s.productId,
    qty: aNumero(s.qty),
    unitCost: s.unitCost == null ? null : aNumero(s.unitCost),
  }));

  // El costo de hoy, sólo de los productos que lo necesitan: líneas cuya venta no guardó el
  // costo (o que no tienen salida de stock) y consumos sin costo. Casi siempre ninguno.
  const conCostoGuardado = new Set(
    salidasDelMes.filter((s) => s.unitCost != null && s.unitCost > 0).map((s) => `${s.orderId ?? ""}|${s.productId ?? ""}`),
  );
  const faltan = new Set<string>();
  for (const p of pedidosDelMes) {
    for (const i of p.items) if (i.productId && !conCostoGuardado.has(`${p.id}|${i.productId}`)) faltan.add(i.productId);
  }
  for (const s of salidasDelMes) if (s.productId && !(s.unitCost != null && s.unitCost > 0)) faltan.add(s.productId);
  let costoVigente: Record<string, number | null> = {};
  if (faltan.size > 0) {
    const productos = await db.product.findMany({
      where: { tenantId, id: { in: [...faltan] } },
      select: { id: true, ...SELECT_INGRESOS },
    });
    costoVigente = costosVigentesDe(productos, opts.costosDelCatalogo ?? new Map());
  }

  return {
    condicion,
    // Lo decide quien llama (la página sabe si el negocio es de mostrador): cambia si hay UNA
    // alícuota verdadera para sacar el IVA (`alicuotaDeLasVentas`, resultado.ts).
    ...(opts.comercio !== undefined ? { comercio: opts.comercio } : {}),
    pedidos: pedidosDelMes,
    pedidosACuenta: new Set(fiados.flatMap((f) => (f.orderId ? [f.orderId] : []))),
    salidas: salidasDelMes,
    costoVigente,
    turnos: { total: aNumero(turnos._sum?.amount), cantidad: turnos._count?._all ?? 0 },
    caja: caja.map(
      (m): MovimientoDeCaja => ({ type: m.type, amount: aNumero(m.amount), createdBy: m.createdBy, orderId: m.orderId }),
    ),
  };
}

/** El resultado del mes del negocio `tenantId`, leído con `db`. */
export async function leerResultadoDelMes(
  db: DbReportes,
  tenantId: string,
  mes: MesKey,
  opts: { costosDelCatalogo?: ReadonlyMap<string, number>; comercio?: boolean } = {},
): Promise<ResultadoDelMes> {
  return calcularResultado(await leerHechosDelMes(db, tenantId, mes, opts));
}
