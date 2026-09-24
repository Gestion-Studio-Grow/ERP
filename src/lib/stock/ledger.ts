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
//
// OJO: este archivo lo importa el formulario de ajustes (client component) por `round3`. No
// puede importar ningún VALOR de Prisma ni de servidor: la base se toca sólo con la `tx` que
// llega por parámetro.

import type { Prisma } from "@/generated/prisma/client";
import { costoVigenteEnTx } from "@/lib/stock/costo";

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

// Redondeo a 3 decimales: el stock puede ser fraccional (kg). Se aplica al delta, al
// balance Y al stock guardado, para no arrastrar el error de coma flotante de sumar muchos
// movimientos. El `+ 0` convierte un −0 (de redondear −0,0001) en 0: un "−0 kg" en pantalla
// parece un faltante que no existe.
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000 + 0;
}

// Media unidad del último decimal que se guarda (medio gramo). La guarda anti-oversell
// compara el stock guardado con lo que sale: un stock que quedó en 0,29999999999999993 por
// la coma flotante de antes tiene que poder vender sus 0,300 kg, porque en pantalla y en la
// balanza son lo mismo. Más allá de medio gramo sí es faltante de verdad.
export const TOLERANCIA_STOCK = 0.0005;

// ¿Hay que corregir el stock guardado? Sí cuando no es exactamente su redondeo a gramos: es
// el caso medido en la QA de la ola 1, 1,1 − 1,24 = −0,13999999999999990 guardado en la base
// (el increment de un Float suma en binario). PURA.
export function stockARedondear(guardado: number): number | null {
  const r = round3(guardado);
  return Object.is(r, guardado) ? null : r;
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

// ¿Esta fila del ledger lleva el costo vigente estampado? Toda SALIDA que llega sin costo:
// la venta, el consumo de un servicio, la merma. Sin el costo guardado en la fila, la merma
// de la semana y el costo de lo vendido se valuaban con el costo de HOY, no con el del día
// del movimiento (y un corte que después cambió de costo reescribía su historia). Las
// entradas no se estampan: su costo es el dato de origen de la regla (una reposición sin
// costo sigue sin costo, no se inventa uno). PURA.
export function llevaCostoEstampado(delta: number, unitCost: number | null | undefined): boolean {
  return delta < 0 && (unitCost === null || unitCost === undefined);
}

/**
 * Un movimiento que el ledger NO aplica (no alcanza el stock, cantidad cero, el producto ya no
 * está). Lo tira ANTES de escribir su fila y dentro de la transacción del llamador, que se
 * deshace entera: prueba que no quedó nada grabado. Por eso es una clase propia y no un `Error`
 * pelado: el alta del mostrador (`motivoDelRechazoDelAlta`, order-core.ts) sólo dice "no se
 * cobró" ante un rechazo así; ante cualquier otro error dice que no se sabe. No hereda de
 * `RechazoDeDominio` porque ése arrastra el logger del servidor y este archivo lo importa un
 * client component (ver la cabecera).
 */
export class RechazoDelStock extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "RechazoDelStock";
  }
}

// Aplica un movimiento de stock DENTRO de la transacción del llamador y registra la
// fila del ledger. Devuelve el `balanceAfter` (stock resultante).
//
// Salida con guarda (delta < 0 && !allowNegative): baja condicional atómica
// (`updateMany` con `stock >= |delta|`, menos medio gramo de tolerancia) — si no alcanza,
// afecta 0 filas y lanza, y como corre dentro de la tx del llamador, aborta toda la
// operación (nada de stock negativo ni ventas parciales). Entradas y salidas con
// allowNegative: incremento directo (Prisma acepta increment negativo).
//
// Después del incremento, si el stock guardado arrastra error de coma flotante, se reescribe
// redondeado EN LA MISMA TRANSACCIÓN. Es seguro: el UPDATE de arriba dejó la fila bloqueada
// hasta el commit, así que nadie más la puede tocar entre la lectura y la corrección, y el
// compare-and-set de la salida ya se decidió antes (no se afloja).
export async function recordMovement(tx: LedgerTx, args: RecordMovementArgs): Promise<number> {
  const delta = signedDelta(args.type, args.qty);
  if (delta === 0) {
    throw new RechazoDelStock("El movimiento de stock no puede ser de cantidad cero.");
  }

  if (delta < 0 && !args.allowNegative) {
    const res = await tx.product.updateMany({
      where: { id: args.productId, tenantId: args.tenantId, stock: { gte: -delta - TOLERANCIA_STOCK } },
      data: { stock: { increment: delta } },
    });
    if (res.count === 0) {
      throw new RechazoDelStock(
        `Sin stock suficiente${args.label ? ` de "${args.label}"` : ""} para descontar ${Math.abs(delta)}.`,
      );
    }
  } else {
    const res = await tx.product.updateMany({
      where: { id: args.productId, tenantId: args.tenantId },
      data: { stock: { increment: delta } },
    });
    if (res.count === 0) {
      throw new RechazoDelStock("No se encontró el producto para registrar el movimiento de stock.");
    }
  }

  const after = await tx.product.findUnique({
    where: { id: args.productId },
    select: { stock: true },
  });
  const balanceAfter = round3(after?.stock ?? 0);
  const corregido = after ? stockARedondear(after.stock) : null;
  if (corregido !== null) {
    await tx.product.updateMany({
      where: { id: args.productId, tenantId: args.tenantId },
      data: { stock: corregido },
    });
  }

  const unitCost = llevaCostoEstampado(delta, args.unitCost)
    ? await costoVigenteEnTx(tx, args.tenantId, args.productId)
    : (args.unitCost ?? null);

  await tx.stockMovement.create({
    data: {
      tenantId: args.tenantId,
      productId: args.productId,
      type: args.type,
      qty: delta,
      unitCost,
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

// Un RECUENTO que coincide con el sistema no mueve stock, pero es un hecho: "el vacío se contó
// el martes y estaba bien". Sin esta fila, un producto contado y en orden figuraba como "sin
// contar" para siempre (recordMovement no admite cantidad cero, y está bien que no). Se
// escribe la fila del ledger con qty 0 y el saldo de ese momento, SIN tocar `Product.stock`:
// el ledger sigue siendo el único que lo cambia. El tablero de merma ya la trata como
// "sin diferencia" (merma-core.ts) y no la suma a nada.
export async function registrarConteoSinDiferencia(
  tx: LedgerTx,
  args: { tenantId: string; productId: string; reason: string; unitCost?: number | null; createdBy: string },
): Promise<number> {
  const row = await tx.product.findFirst({
    where: { id: args.productId, tenantId: args.tenantId },
    select: { stock: true },
  });
  if (!row) throw new Error("No se encontró el producto para registrar el recuento.");
  const balanceAfter = round3(row.stock);
  await tx.stockMovement.create({
    data: {
      tenantId: args.tenantId,
      productId: args.productId,
      type: "AJUSTE",
      qty: 0,
      unitCost: args.unitCost ?? null,
      balanceAfter,
      reason: args.reason,
      createdBy: args.createdBy,
    },
  });
  return balanceAfter;
}
