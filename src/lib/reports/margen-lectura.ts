// ============================================================================
// LECTURA del margen de hoy — precio de lista contra costo vigente, por producto.
// ============================================================================
//
// Dos lecturas que comparten la consulta de productos (`whereProductosDeStock` + el mismo
// `select`, con su último ingreso con costo: `SELECT_INGRESOS`, el costo vigente de Stock y
// Catálogo) y la misma cuenta (`computeProductMargins`):
//
//   · la PANTALLA (`leerMargenDeHoy`): los productos y la condición fiscal, en paralelo. Un
//     Responsable Inscripto compara SIN IVA (el IVA del precio no es suyo), así que ve también
//     los productos que sólo pierden al sacar el IVA.
//   · el BOTÓN del Inicio (`leerMargenDelBoton`): UNA consulta, la de productos (regla 8 de la
//     arquitectura: una operación por número; antes eran dos, con la condición fiscal). Sin
//     condición no se sabe si sacar el IVA, así que cuenta los que tienen el PRECIO DE LISTA
//     por debajo del costo: esos pierden plata en cualquier condición, y para un monotributista
//     (o un negocio que todavía no facturó) es exactamente el número de la pantalla. A un
//     inscripto la pantalla le muestra ese mismo número y, aparte, los que pierden al sacar el
//     IVA (`precioDeListaBajoCosto`).
//
// `costosDelCatalogo` es el costo fijado a mano (`Product.cost`), que sólo se puede leer con
// una consulta cruda en la transacción del negocio (inventory-loader.ts). La pantalla lo
// pasa; el botón del Inicio no (no puede abrir transacciones), igual que el botón de Stock.
// Hoy esa columna no existe en ninguna base medida, así que los dos dan lo mismo.

import type { Prisma } from "@/generated/prisma/client";
import { SELECT_INGRESOS, costosVigentesDe } from "@/lib/stock/costo";
import { whereProductosDeStock } from "@/lib/inventory/valuation";
import type { CondicionLibro } from "@/lib/libros/libro-iva";
import { alicuotaDeLasVentas, ivaSinAlicuotaConocida } from "./resultado";
import { leerCondicion } from "./resultado-lectura";
import {
  computeProductMargins,
  productosBajoCosto,
  summarizeMargins,
  type MarginRow,
  type MarginSummary,
  type SaleUnit,
} from "./margin";

type DbMargen = Prisma.TransactionClient;

/** La consulta de productos del margen: la misma para la pantalla y para el botón. */
function leerProductos(db: DbMargen, tenantId: string) {
  return db.product.findMany({
    where: whereProductosDeStock(tenantId),
    select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, ...SELECT_INGRESOS },
  });
}

type ProductoLeido = Awaited<ReturnType<typeof leerProductos>>[number];

interface MargenDeProductos {
  /** Filas con precio y costo, con el precio SIN IVA si `sinIva`. */
  rows: MarginRow[];
  /** Productos con el precio de lista (como se cobra) por debajo del costo. El número del botón. */
  precioDeListaBajoCosto: number;
  /** Productos activos con precio pero sin costo: no se les puede calcular margen. */
  sinCosto: number;
}

/** La cuenta del margen sobre productos ya leídos (el costo vigente sale de sus propias filas). */
function margenDeProductos(
  productos: readonly ProductoLeido[],
  costosDelCatalogo: ReadonlyMap<string, number>,
  sinIva: boolean,
): MargenDeProductos {
  const costos = costosVigentesDe(productos, costosDelCatalogo);
  const costByProduct: Record<string, number> = {};
  for (const [id, c] of Object.entries(costos)) if (c != null) costByProduct[id] = c;
  const entrada = productos.map((p) => ({
    id: p.id,
    name: p.name,
    saleUnit: p.saleUnit as SaleUnit,
    price: p.price,
    pricePerKg: p.pricePerKg,
  }));
  const comoSeCobra = computeProductMargins(entrada, costByProduct);
  const conPrecio = entrada.filter((p) => ((p.saleUnit === "WEIGHT" ? p.pricePerKg : p.price) ?? 0) > 0);
  return {
    rows: sinIva ? computeProductMargins(entrada, costByProduct, { sinIva: true }) : comoSeCobra,
    precioDeListaBajoCosto: productosBajoCosto(comoSeCobra),
    sinCosto: conPrecio.filter((p) => costByProduct[p.id] === undefined).length,
  };
}

export interface MargenDeHoy {
  condicion: CondicionLibro;
  sinIva: boolean;
  /** Inscripto de mostrador: los precios van con IVA porque no hay alícuota por producto. */
  ivaIncluidoSinAlicuota: boolean;
  rows: MarginRow[];
  summary: MarginSummary;
  /** Con el precio de lista por debajo del costo: el número del botón del Inicio. */
  precioDeListaBajoCosto: number;
  /** Productos activos con precio pero sin costo: no se les puede calcular margen. */
  sinCosto: number;
}

/** La pantalla de Margen: productos y condición fiscal, en paralelo. */
export async function leerMargenDeHoy(
  db: DbMargen,
  tenantId: string,
  opts: { costosDelCatalogo?: ReadonlyMap<string, number>; comercio?: boolean } = {},
): Promise<MargenDeHoy> {
  const [productos, condicion] = await Promise.all([leerProductos(db, tenantId), leerCondicion(db, tenantId)]);
  // La misma regla que el resultado del mes: sin la alícuota de cada producto, un mostrador
  // inscripto no puede sacar el IVA con un 21% que no es de todo lo que vende.
  const comercio = { comercio: opts.comercio ?? false };
  const sinIva = alicuotaDeLasVentas(condicion, comercio) != null;
  const m = margenDeProductos(productos, opts.costosDelCatalogo ?? new Map(), sinIva);
  return {
    condicion,
    sinIva,
    ivaIncluidoSinAlicuota: ivaSinAlicuotaConocida(condicion, comercio),
    // Lo que se vende a pérdida, primero: es lo que hay que corregir.
    rows: [...m.rows].sort((a, b) => a.marginPct - b.marginPct),
    summary: summarizeMargins(m.rows),
    precioDeListaBajoCosto: m.precioDeListaBajoCosto,
    sinCosto: m.sinCosto,
  };
}

export interface MargenDelBoton {
  /** Productos con precio y costo. */
  conMargen: number;
  precioDeListaBajoCosto: number;
  sinCosto: number;
}

/** El botón del Inicio: UNA consulta (los productos), sin condición fiscal. */
export async function leerMargenDelBoton(db: DbMargen, tenantId: string): Promise<MargenDelBoton> {
  const m = margenDeProductos(await leerProductos(db, tenantId), new Map(), false);
  return { conMargen: m.rows.length, precioDeListaBajoCosto: m.precioDeListaBajoCosto, sinCosto: m.sinCosto };
}
