// Ledger de stock — el ÚNICO mutador de `Product.stock`.
//
// Todo cambio de existencias (venta, compra/reposición, consumo de insumo, ajuste)
// pasa por `recordMovement`: aplica el delta al stock Y escribe la fila del ledger en
// la MISMA transacción, así el stock y su historia nunca divergen. Antes cada flujo
// hacía su propio `stock: { increment/decrement }` con guardas asimétricas (la venta
// tenía guarda anti-oversell, el consumo de servicio no); centralizar acá unifica esa
// regla y da trazabilidad (StockMovement, ver prisma/schema.prisma).
//
// La aritmética de signo es pura y testeable (`movementDirection`, `signedDelta`,
// `round3`); `recordMovement` es el envoltorio que persiste dentro de una transacción
// tenant-aware ya abierta por el llamador (order-core, purchase-core, actions, etc.).

import type { Prisma } from "@/generated/prisma/client";

// Cliente de transacción interactiva: lo que recibe el callback de
// `tenantTransaction`/`$transaction`. `recordMovement` corre SIEMPRE dentro de una tx
// del llamador (nunca abre la suya), para componer con el resto de la operación.
export type LedgerTx = Prisma.TransactionClient;

export type StockMovementType =
  | "VENTA"
  | "COMPRA"
  | "REPOSICION"
  | "CONSUMO"
  | "AJUSTE"
  | "DEVOLUCION_PROVEEDOR";

// Redondeo a 3 decimales: el stock puede ser fraccional (kg). Se aplica al delta y al
// balance para no arrastrar el error de coma flotante de sumar muchos movimientos.
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Dirección canónica de un tipo sobre el stock:
//   +1 → entra (COMPRA, REPOSICION)
//   -1 → sale  (VENTA, CONSUMO)
//    0 → el signo lo trae el delta declarado (AJUSTE: recuento/merma pueden ir en
//        cualquier sentido). Un tipo desconocido no mueve stock (fail-safe).
export function movementDirection(type: StockMovementType): -1 | 0 | 1 {
  switch (type) {
    case "COMPRA":
    case "REPOSICION":
      return 1;
    case "VENTA":
    case "CONSUMO":
    case "DEVOLUCION_PROVEEDOR": // la mercadería sale del stock hacia el proveedor
      return -1;
    case "AJUSTE":
      return 0;
    default:
      return 0;
  }
}

// Delta FIRMADO que un movimiento aplica al stock. Para los tipos con dirección fija,
// se toma la magnitud (|qty|) y el signo lo pone el tipo — así un llamador no puede
// "sumar" con una VENTA mandando un qty negativo. Para AJUSTE, `qty` YA es el delta
// firmado que se quiere aplicar (+ suma, − resta).
export function signedDelta(type: StockMovementType, qty: number): number {
  const magnitude = Math.abs(qty);
  return type === "AJUSTE" ? round3(qty) : round3(movementDirection(type) * magnitude);
}

export type RecordMovementArgs = {
  tenantId: string;
  productId: string;
  type: StockMovementType;
  // Magnitud (sin signo) para VENTA/COMPRA/REPOSICION/CONSUMO; delta FIRMADO para AJUSTE.
  qty: number;
  unitCost?: number | null;
  reason?: string | null;
  orderId?: string | null;
  purchaseId?: string | null;
  appointmentId?: string | null;
  createdBy: string;
  // Nombre del producto para el mensaje de faltante (opcional, mejora el error).
  label?: string;
  // Permitir dejar stock negativo en una salida (default false → guarda anti-oversell).
  // Se usa, p.ej., para no bloquear el cierre de un turno por falta de insumo cargado.
  allowNegative?: boolean;
};

// Aplica un movimiento de stock DENTRO de la transacción del llamador y registra la
// fila del ledger. Devuelve el `balanceAfter` (stock resultante).
//
// Salida con guarda (delta < 0 && !allowNegative): baja condicional atómica
// (`updateMany` con `stock >= |delta|`) — si no alcanza, afecta 0 filas y lanza, y como
// corre dentro de la tx del llamador, aborta toda la operación (nada de stock negativo
// ni ventas parciales). Entradas y salidas con allowNegative: incremento directo
// (Prisma acepta increment negativo).
export async function recordMovement(tx: LedgerTx, args: RecordMovementArgs): Promise<number> {
  const delta = signedDelta(args.type, args.qty);
  if (delta === 0) {
    throw new Error("El movimiento de stock no puede ser de cantidad cero.");
  }

  if (delta < 0 && !args.allowNegative) {
    const res = await tx.product.updateMany({
      where: { id: args.productId, tenantId: args.tenantId, stock: { gte: -delta } },
      data: { stock: { increment: delta } },
    });
    if (res.count === 0) {
      throw new Error(
        `Sin stock suficiente${args.label ? ` de "${args.label}"` : ""} para descontar ${Math.abs(delta)}.`,
      );
    }
  } else {
    const res = await tx.product.updateMany({
      where: { id: args.productId, tenantId: args.tenantId },
      data: { stock: { increment: delta } },
    });
    if (res.count === 0) {
      throw new Error("No se encontró el producto para registrar el movimiento de stock.");
    }
  }

  const after = await tx.product.findUnique({
    where: { id: args.productId },
    select: { stock: true },
  });
  const balanceAfter = round3(after?.stock ?? 0);

  await tx.stockMovement.create({
    data: {
      tenantId: args.tenantId,
      productId: args.productId,
      type: args.type,
      qty: delta,
      unitCost: args.unitCost ?? null,
      balanceAfter,
      reason: args.reason ?? null,
      orderId: args.orderId ?? null,
      purchaseId: args.purchaseId ?? null,
      appointmentId: args.appointmentId ?? null,
      createdBy: args.createdBy,
    },
  });

  return balanceAfter;
}
