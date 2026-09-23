// ============================================================================
// LECTURA de Devoluciones a proveedor — servidor, sin "use server".
// ============================================================================
//
// Lo que necesita la pantalla: las compras que se pueden devolver (con lo que queda de cada
// línea y el stock de hoy), si cada compra tiene deuda abierta (para ofrecer "descontar de la
// deuda") y el historial. Antes el loader hacía una consulta por compra para saber lo ya
// devuelto; ahora es UNA agrupada para todas (compra × producto).
//
// La llama la página después de `requireApp("devoluciones-a-proveedor")`. Pide
// `purchasing:manage` y lee siempre el negocio del request.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { lineasPorProducto, listSupplierReturns } from "@/lib/stock/supplier-return";
import { whereCompras } from "@/lib/stock/purchase-core";
import { fmtShortDate } from "@/lib/datetime";

export interface LineaDevolvible {
  productId: string;
  nombre: string;
  unidad: string;
  /** Lo que queda por devolver de esta compra (comprado − ya devuelto). */
  queda: number;
  /** Stock de hoy: no se puede devolver más de lo que hay. */
  stock: number;
  unitCost: number;
}

export interface CompraDevolvible {
  id: string;
  etiqueta: string;
  tieneDeuda: boolean;
  lineas: LineaDevolvible[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function getDevolucionesData() {
  await requireCapability("purchasing:manage");
  const tenantId = await getCurrentTenantId();

  const compras = await prisma.stockPurchase.findMany({
    where: whereCompras(tenantId),
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      code: true,
      supplier: true,
      createdAt: true,
      items: { select: { productId: true, name: true, unit: true, quantity: true, unitCost: true } },
    },
  });
  const ids = compras.map((c) => c.id);
  const productIds = [...new Set(compras.flatMap((c) => c.items.flatMap((i) => (i.productId ? [i.productId] : []))))];

  const [devuelto, productos, deudas, historial] = await Promise.all([
    ids.length
      ? prisma.stockMovement.groupBy({
          by: ["purchaseId", "productId"],
          where: { tenantId, type: "DEVOLUCION_PROVEEDOR", purchaseId: { in: ids } },
          _sum: { qty: true },
        })
      : Promise.resolve([]),
    productIds.length
      ? prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, stock: true } })
      : Promise.resolve([]),
    leerComprasConDeuda(tenantId, ids),
    listSupplierReturns(tenantId, { limit: 100 }),
  ]);
  const yaDevuelto = new Map(devuelto.map((g) => [`${g.purchaseId}:${g.productId}`, Math.abs(g._sum.qty ?? 0)]));
  const stock = new Map(productos.map((p) => [p.id, p.stock]));

  const devolvibles: CompraDevolvible[] = compras
    .map((c) => {
      // Una línea por producto aunque la compra lo traiga dos veces: se suma lo comprado, a
      // costo promedio (`lineasPorProducto`, la misma cuenta que usa la transacción).
      const devueltoDeEsta = new Map(
        [...yaDevuelto.entries()].flatMap(([k, v]) => (k.startsWith(`${c.id}:`) ? [[k.slice(c.id.length + 1), v] as const] : [])),
      );
      const lineas = lineasPorProducto(c.items, devueltoDeEsta, stock);
      return {
        id: c.id,
        etiqueta: `${c.supplier ?? "Sin proveedor"} · ${fmtShortDate(c.createdAt)} · #${c.code}`,
        tieneDeuda: deudas.has(c.id),
        lineas: lineas
          .map((l) => ({ ...l, queda: Math.max(0, r3(l.comprado - l.yaDevuelto)) }))
          .filter((l) => l.queda > 0)
          .map((l) => ({ productId: l.productId, nombre: l.nombre, unidad: l.unidad, queda: l.queda, stock: l.stock, unitCost: l.unitCost })),
      };
    })
    .filter((c) => c.lineas.length > 0);

  const codigo = new Map(compras.map((c) => [c.id, c.code]));
  return {
    compras: devolvibles,
    historial: historial.map((h) => ({ ...h, compra: h.purchaseId ? (codigo.get(h.purchaseId) ?? null) : null })),
  };
}

/** Las compras con una cuenta a pagar abierta. Sin la tabla en esta base, ninguna. */
async function leerComprasConDeuda(tenantId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const filas = await prisma.accountPayable.findMany({
      where: { tenantId, status: "OPEN", purchaseId: { in: ids } },
      select: { purchaseId: true },
    });
    return new Set(filas.flatMap((f) => (f.purchaseId ? [f.purchaseId] : [])));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2021" || code === "P2022") return new Set();
    throw err;
  }
}
