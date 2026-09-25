// ============================================================================
// NÚMEROS DE STOCK Y COMPRAS — Stock, Movimientos, Recuento, Mermas, Recibir mercadería,
// Proveedores y Devoluciones.
// ============================================================================
//
// Mismas reglas que todos los loaders de esta carpeta (ver mostrador.server.ts): el `db` del
// contexto, sin transacciones, UNA consulta por número, el `where` de la pantalla (importado del
// módulo que lo define, no re-escrito) y la plata sólo cuando el rol la ve (`monto`). Cada número
// dice lo mismo que su pantalla:
//   · Stock: `computeStockValuation` con el costo vigente (stock/costo.ts), la misma cuenta que
//     `getInventoryValuation`. Sin `Product.cost`: esa columna se lee con SQL crudo y un tile no
//     puede abrir una transacción; hasta que la migración cárnica esté en la base no existe, y
//     cuando esté, el tile puede diferir de la pantalla en los productos con costo de catálogo.
//   · Movimientos: la cola "en negativo" de la pantalla (`whereEnNegativo`).
//   · Recuento: "sin contar hace más de 30 días" (`whereSinContarDesde`).
//   · Mermas: los AJUSTE del mes (`whereAjustesDelPeriodo`, el del tablero de merma) clasificados
//     con `clasificarAjuste`, en pesos con el costo guardado en cada fila.
//   · Recibir mercadería, Proveedores y Devoluciones: `whereCompras`, `whereProveedoresActivos`
//     y `whereDevoluciones`, los de sus pantallas.
//   · Sugerido de compra: `whereSugerido` + `selectDemanda` (suppliers/sugerido.ts), la lectura
//     de su pantalla, contada con la misma fórmula (`cuantosParaPedir`).
//   · Lotes y Despiece siguen sin número: sus tablas son de la migración cárnica, que no está
//     en el cliente de Prisma, y un tile no puede abrir la transacción que pide el SQL crudo.
//
// Mermas es la excepción a "una consulta por número" (decisión de plataforma, integración de la
// ola 2): "N por recepción" y "% de la venta" son dos lecturas más, en paralelo con la de los
// ajustes. Quién es recepción sale de los usuarios con rol RECEPTION del negocio (una merma de
// la dueña o de una profesional no cuenta); la venta del mes, del mismo `where` que Ventas del
// día (`whereVentasCobradas`), y sólo se lee con `monto`, porque el porcentaje es plata.

import { businessWallTimeToUtc } from "@/lib/datetime";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { computeStockValuation, whereEnNegativo, whereProductosDeStock } from "@/lib/inventory/valuation";
import { SELECT_INGRESOS, costosVigentesDe } from "@/lib/stock/costo";
import { clasificarAjuste, whereAjustesDelPeriodo } from "@/lib/stock/merma-core";
import { whereCompras } from "@/lib/stock/purchase-core";
import { whereDevoluciones } from "@/lib/stock/supplier-return";
import { whereProveedoresActivos } from "@/lib/suppliers/supplier";
import { cuantosParaPedir, desdeVentaReciente, selectDemanda, whereSugerido } from "@/lib/suppliers/sugerido";
import { desdeRecuentoReciente, whereSinContarDesde } from "@/lib/inventario/recuento";
import { whereVentasCobradas } from "@/lib/order-anulacion";
import { fmtMoneyARS, fmtNumberAR } from "@/components/ui/format";
import { plural, type LoaderKpi } from "./nucleo.server";

/** El primer instante del mes del negocio ("2026-09-23" → 01/09 00:00 en hora del negocio). */
export function inicioDelMes(hoy: string): Date {
  return businessWallTimeToUtc(`${hoy.slice(0, 7)}-01`, "00:00");
}

// ── Stock ────────────────────────────────────────────────────────────────────

/**
 * "5 cortes bajo el mínimo · 2 sin costo", y la plata (el stock valorizado) sólo con
 * reports:read. Lee lo mismo que la pantalla de Stock (activos y no borrados, con su último
 * ingreso con costo) y cuenta con SUS reglas (`computeStockValuation`: `esStockBajo` y
 * `unvaluedCount`). Se cuenta en memoria y no con una comparación entre columnas en la base
 * porque no está medido que esa comparación pase bien por la extensión de RLS; son cientos de
 * filas, no miles.
 */
export const inventario: LoaderKpi = async ({ db, tenantId, sustantivo, monto }) => {
  const productos = await db.product.findMany({
    where: whereProductosDeStock(tenantId),
    select: { id: true, name: true, unit: true, stock: true, lowStockAt: true, trackStock: true, ...SELECT_INGRESOS },
  });
  const v = computeStockValuation(productos, costosVigentesDe(productos, new Map()));
  const bajo = v.summary.lowStockCount;
  const sinCosto = v.summary.unvaluedCount;
  return {
    valor: fmtNumberAR(bajo),
    detalle:
      `${plural(bajo, sustantivo.uno, sustantivo.varios)} bajo el mínimo` + (sinCosto > 0 ? ` · ${fmtNumberAR(sinCosto)} sin costo` : ""),
    ...(monto ? { monto: `${fmtMoneyARS(v.summary.totalValue, 0)} valorizado` } : {}),
  };
};

// ── Movimientos: la cola "en negativo" ───────────────────────────────────────

/** "2 cortes en negativo — recontar", en alerta: es lo primero que hay que mirar. */
export const movimientos: LoaderKpi = async ({ db, tenantId, sustantivo }) => {
  const n = await db.product.count({ where: whereEnNegativo(tenantId) });
  if (n === 0) return { valor: "0", detalle: `${sustantivo.varios} en negativo` };
  return {
    valor: fmtNumberAR(n),
    detalle: `${plural(n, sustantivo.uno, sustantivo.varios)} en negativo`,
    alerta: { valor: fmtNumberAR(n), texto: `${plural(n, sustantivo.uno, sustantivo.varios)} en negativo — recontar` },
  };
};

// ── Recuento ─────────────────────────────────────────────────────────────────

/** "12 cortes sin contar hace más de 30 días". No es alerta: es la agenda del encargado. */
export const recuento: LoaderKpi = async ({ db, tenantId, ahora, sustantivo }) => {
  const n = await db.product.count({ where: whereSinContarDesde(tenantId, desdeRecuentoReciente(ahora)) });
  return { valor: fmtNumberAR(n), detalle: `${plural(n, sustantivo.uno, sustantivo.varios)} sin contar hace más de 30 días` };
};

// ── Mermas ───────────────────────────────────────────────────────────────────

/**
 * Lo que el número cuenta de los ajustes del mes: sólo las MERMAS, como el tablero. PURA.
 * `recepcion`: los actores ("user:<id>") de quienes tienen rol RECEPTION en el negocio; una
 * merma de la dueña o de una profesional no cuenta como "por recepción".
 */
export function resumirMermasDelMes(
  movs: readonly { productId: string | null; qty: number; reason: string | null; createdBy: string; unitCost: number | null }[],
  recepcion: ReadonlySet<string> = new Set(),
): { cargadas: number; pesos: number; sinCosto: number; porRecepcion: number } {
  let cargadas = 0;
  let pesos = 0;
  let sinCosto = 0;
  let porRecepcion = 0;
  for (const m of movs) {
    if (clasificarAjuste(m).clase !== "MERMA") continue;
    cargadas++;
    if (recepcion.has(m.createdBy)) porRecepcion++;
    if (m.unitCost != null && m.unitCost > 0) pesos += Math.abs(m.qty) * m.unitCost;
    else sinCosto++;
  }
  return { cargadas, pesos: redondearAlCentavo(pesos), sinCosto, porRecepcion };
}

/** "(3,2 % de la venta)": la merma a costo sobre lo cobrado del mes. Sin venta, nada. PURA. */
export function textoPorcentajeDeVenta(pesos: number, venta: number): string {
  if (!(venta > 0) || !(pesos > 0)) return "";
  const pct = Math.round((pesos / venta) * 1000) / 10;
  return ` (${pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })} % de la venta)`;
}

/**
 * "3 cargadas este mes · 1 por recepción", y con reports:read "$X a costo (Y % de la venta)".
 * Los AJUSTE del mes con el `where` del tablero de merma, quiénes son recepción y, sólo con
 * `monto`, lo cobrado del mes (`whereVentasCobradas`): TRES consultas en paralelo, la excepción
 * declarada en loaders.test.ts. Una fila sin costo guardado (de antes de la ola 2) no se valúa
 * en $0: se cuenta aparte ("N sin costo"), y el porcentaje queda por debajo de lo real.
 */
export const mermas: LoaderKpi = async ({ db, tenantId, hoy, monto }) => {
  const desde = inicioDelMes(hoy);
  const [movs, recepcionistas, venta] = await Promise.all([
    db.stockMovement.findMany({
      where: whereAjustesDelPeriodo(tenantId, desde),
      select: { productId: true, qty: true, reason: true, createdBy: true, unitCost: true },
      take: 5000,
    }),
    db.user.findMany({ where: { tenantId, role: "RECEPTION" }, select: { id: true } }),
    monto ? db.order.aggregate({ where: whereVentasCobradas(tenantId, desde), _sum: { total: true } }) : null,
  ]);
  const r = resumirMermasDelMes(movs, new Set(recepcionistas.map((u) => `user:${u.id}`)));
  const porRecepcion = r.cargadas > 0 ? ` · ${fmtNumberAR(r.porRecepcion)} por recepción` : "";
  const dato = { valor: fmtNumberAR(r.cargadas), detalle: `${plural(r.cargadas, "cargada", "cargadas")} este mes${porRecepcion}` };
  if (!monto) return dato;
  const pct = textoPorcentajeDeVenta(r.pesos, venta?._sum.total ?? 0);
  const sinCosto = r.sinCosto > 0 ? ` · ${fmtNumberAR(r.sinCosto)} sin costo` : "";
  return { ...dato, monto: `${fmtMoneyARS(r.pesos, 0)} a costo${pct}${sinCosto}` };
};

// ── Recibir mercadería ───────────────────────────────────────────────────────

/** "4 recepciones este mes · 1 sin proveedor de la lista", y lo comprado con reports:read. */
export const recibirMercaderia: LoaderKpi = async ({ db, tenantId, hoy, monto }) => {
  const grupos = await db.stockPurchase.groupBy({
    by: ["supplierId"],
    where: whereCompras(tenantId, inicioDelMes(hoy)),
    _count: { _all: true },
    _sum: { totalCost: true },
  });
  let n = 0;
  let sinProveedor = 0;
  let total = 0;
  for (const g of grupos) {
    n += g._count._all;
    if (!g.supplierId) sinProveedor += g._count._all;
    total += g._sum.totalCost ?? 0;
  }
  return {
    valor: fmtNumberAR(n),
    detalle: `${plural(n, "recepción", "recepciones")} este mes` + (sinProveedor > 0 ? ` · ${fmtNumberAR(sinProveedor)} sin proveedor de la lista` : ""),
    ...(monto ? { monto: `${fmtMoneyARS(total, 0)} comprado` } : {}),
  };
};

// ── Proveedores ──────────────────────────────────────────────────────────────

/**
 * "12 proveedores · 3 sin CUIT", con un solo conteo: `_count.taxId` cuenta los que tienen CUIT
 * (el alta guarda `null` cuando no hay, `validateSupplierInput`). Lo que se les debe llega con
 * las cuentas corrientes (ola 3).
 */
export const proveedores: LoaderKpi = async ({ db, tenantId }) => {
  const c = await db.supplier.aggregate({ where: whereProveedoresActivos(tenantId), _count: { _all: true, taxId: true } });
  const total = c._count._all;
  const sinCuit = total - c._count.taxId;
  return {
    valor: fmtNumberAR(total),
    detalle: `${plural(total, "proveedor", "proveedores")}` + (sinCuit > 0 ? ` · ${fmtNumberAR(sinCuit)} sin CUIT` : ""),
  };
};

// ── Sugerido de compra ───────────────────────────────────────────────────────

/**
 * "4 cortes para pedir hoy": los productos que controlan stock con su venta de los últimos 28
 * días, en UNA consulta (el producto con sus movimientos), contados con la fórmula de la
 * pantalla. Sin plata: son cantidades. No es alerta: es la agenda de compras del día.
 */
export const sugeridoDeCompra: LoaderKpi = async ({ db, tenantId, ahora, sustantivo }) => {
  const productos = await db.product.findMany({
    where: whereSugerido(tenantId),
    select: { id: true, name: true, unit: true, saleUnit: true, stock: true, lowStockAt: true, stockMovements: selectDemanda(desdeVentaReciente(ahora)) },
  });
  const n = cuantosParaPedir(productos);
  return { valor: fmtNumberAR(n), detalle: `${plural(n, sustantivo.uno, sustantivo.varios)} para pedir hoy` };
};

// ── Devoluciones a proveedor ─────────────────────────────────────────────────

/** "$X devuelto este mes", al costo con que entró cada cosa. Todo el número es plata. */
export const devolucionesAProveedor: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const movs = await db.stockMovement.findMany({
    where: whereDevoluciones(tenantId, inicioDelMes(hoy)),
    select: { qty: true, unitCost: true },
    take: 5000,
  });
  const total = movs.reduce((s, m) => s + (m.unitCost ? Math.abs(m.qty) * m.unitCost : 0), 0);
  return { valor: fmtMoneyARS(total, 0), detalle: "devuelto este mes" };
};

export const LOADERS_LOGISTICA: Readonly<Record<string, LoaderKpi>> = {
  inventario,
  movimientos,
  recuento,
  mermas,
  "recibir-mercaderia": recibirMercaderia,
  proveedores,
  "sugerido-de-compra": sugeridoDeCompra,
  "devoluciones-a-proveedor": devolucionesAProveedor,
};
