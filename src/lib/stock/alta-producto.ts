// ALTA DE PRODUCTO CON STOCK INICIAL — el stock entra por el ledger, no por el `create`.
//
// Antes `createProduct` hacía `product.create({ data: { stock } })`: el producto nacía con
// sus kilos y el ledger (`StockMovement`) no tenía ninguna fila que los explicara. El primer
// movimiento del historial era la primera venta, y `balanceAfter` de esa venta no cerraba
// contra nada. `ledger.ts` se declara ÚNICO mutador de `Product.stock`; esto lo hace cierto
// también para el alta: el producto se crea en 0 y, si trae stock inicial, se asienta un
// AJUSTE "Stock inicial" en la MISMA transacción (o entran los dos, o ninguno).
//
// Dos piezas, a propósito separadas:
//   · `planDeAlta` — PURA: decide qué fila se crea y qué movimiento se asienta. Es lo que
//     se testea con datos.
//   · `crearProductoConStockInicial(tx, …)` — ejecuta el plan dentro de la tx del
//     llamador (nunca abre la suya, igual que `recordMovement`). El llamador la envuelve en
//     `tenantTransaction`.
//
// Sin "use server": recibe `tenantId` por parámetro, así que NO puede ser un endpoint. La
// Server Action (catalog-actions.ts) resuelve el tenant con `getCurrentTenantId()`.

import { recordMovement, round3, type LedgerTx } from "@/lib/stock/ledger";
import type { ProductSaleFields } from "@/lib/stock/product-sale-fields";

/** El `reason` del movimiento que abre el historial de un producto. */
export const MOTIVO_STOCK_INICIAL = "Stock inicial";

export type AltaProducto = {
  tenantId: string;
  name: string;
  unit: string;
  lowStockAt: number;
  venta: ProductSaleFields;
  /** Lo que se tipeó en "Stock inicial", ya leído. 0 = sin stock inicial. */
  stockInicial: number;
  /** Actor "user:<id>", lo resuelve la Server Action. */
  createdBy: string;
};

export type PlanDeAlta = {
  producto: {
    tenantId: string;
    name: string;
    unit: string;
    lowStockAt: number;
    stock: 0;
  } & ProductSaleFields;
  movimiento: { type: "AJUSTE"; qty: number; reason: string; createdBy: string } | null;
};

/**
 * Qué se crea y qué se asienta. PURA.
 *
 * Un stock inicial negativo o no finito es un error de la pantalla (la Server Action ya lo
 * leyó con `leerCantidad`, que no deja pasar el "-"), así que acá se RECHAZA en vez de
 * normalizarse: un producto que nace con −3 kg no es un caso de negocio.
 */
export function planDeAlta(a: AltaProducto): PlanDeAlta {
  const name = a.name.trim();
  if (!name) throw new Error("El producto necesita un nombre.");
  if (!Number.isFinite(a.stockInicial) || a.stockInicial < 0) {
    throw new Error("El stock inicial tiene que ser una cantidad mayor o igual a cero.");
  }
  const qty = round3(a.stockInicial);
  return {
    producto: {
      tenantId: a.tenantId,
      name,
      unit: a.unit,
      lowStockAt: a.lowStockAt,
      ...a.venta,
      // Nace en CERO siempre. Lo que haya lo pone el ledger, con su fila.
      stock: 0,
    },
    movimiento:
      qty > 0 ? { type: "AJUSTE", qty, reason: MOTIVO_STOCK_INICIAL, createdBy: a.createdBy } : null,
  };
}

/**
 * Crea el producto en 0 y asienta el stock inicial con `recordMovement`, dentro de la tx
 * del llamador. Devuelve el id creado y el stock con que quedó.
 */
export async function crearProductoConStockInicial(
  tx: LedgerTx,
  a: AltaProducto,
): Promise<{ id: string; stock: number }> {
  const plan = planDeAlta(a);
  const creado = await tx.product.create({ data: plan.producto, select: { id: true } });
  if (!plan.movimiento) return { id: creado.id, stock: 0 };
  const stock = await recordMovement(tx, {
    tenantId: a.tenantId,
    productId: creado.id,
    ...plan.movimiento,
    label: plan.producto.name,
  });
  return { id: creado.id, stock };
}
