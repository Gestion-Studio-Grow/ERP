// Puente TALLER → LIBRO DE CAJA y TALLER → STOCK.
//
// Mismo diseño que el puente de turnos (src/lib/caja/cobro-turno.ts), a propósito:
//   · El cobro de una orden asienta UNA `VENTA` en el libro, dentro de la misma transacción
//     que el cobro (todo o nada). La clave del asiento es el cobro (`tallerPagoId`) y el árbitro
//     es `@@unique(tenantId, tallerPagoId, type)`: un doble envío choca en la base.
//   · `VENTA`, no `INGRESO`: es lo que cobró el sistema, no lo que tipeó el dueño en el libro.
//   · Anular un cobro NO borra el asiento: escribe su contrapartida (`EGRESO`) con fecha de HOY
//     — la plata sale de la caja hoy — y el cobro queda marcado como anulado. Un día ya cerrado
//     no se reescribe.
//   · Dirección única: el taller escribe en el libro; el libro nunca escribe en el taller.
//
// Los repuestos del catálogo que se usaron salen del stock al ENTREGAR el auto, por el ledger
// de siempre (`recordMovement`, tipo CONSUMO). No frena la entrega por faltante: el auto ya está
// arreglado; el stock en rojo es la señal para reponer o ajustar.

import type { Prisma } from "@/generated/prisma/client";
import { recordMovement } from "@/lib/stock/ledger";
import { redondear, type MedioPago } from "./core";

type Tx = Prisma.TransactionClient;

/** La columna del libro de caja donde cae cada medio del taller. */
export function metodoDeCaja(medio: MedioPago): "EFECTIVO" | "MP" | "TARJETA" {
  switch (medio) {
    case "EFECTIVO":
      return "EFECTIVO";
    case "DEBITO":
    case "CREDITO":
      return "TARJETA";
    // Transferencia y Mercado Pago van juntas, como en el resto del motor
    // (cashMethodFromPaymentMethod): es como el negocio lleva la columna.
    default:
      return "MP";
  }
}

/** Lo que entra de verdad a la caja: el importe del trabajo más el recargo de la tarjeta. */
export const importeDeCaja = (monto: number, recargo: number): number => redondear(monto + recargo);

export function detalleDelCobro(numero: number, patente: string, nota?: string | null): string {
  return `Taller · orden #${numero} · ${patente}${nota ? ` · ${nota}` : ""}`;
}

/** Asienta la VENTA del cobro. Si ya estaba asentada, no hace nada (idempotente). */
export async function asentarCobroInTx(
  tx: Tx,
  tenantId: string,
  input: { pagoId: string; medio: MedioPago; monto: number; recargo: number; detalle: string; actor: string },
): Promise<{ asentado: boolean }> {
  const amount = importeDeCaja(input.monto, input.recargo);
  if (!(amount > 0)) return { asentado: false };
  const ya = await tx.cashMovement.findFirst({ where: { tenantId, tallerPagoId: input.pagoId, type: "VENTA" }, select: { id: true } });
  if (ya) return { asentado: false };
  // Si el negocio trabaja con turno de caja abierto, el asiento se engancha para que el arqueo
  // lo vea; si no, queda suelto y el libro lo toma igual.
  const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
  await tx.cashMovement.create({
    data: {
      tenantId,
      sessionId: session?.id ?? null,
      type: "VENTA",
      method: metodoDeCaja(input.medio),
      amount,
      reason: input.detalle,
      tallerPagoId: input.pagoId,
      createdBy: input.actor,
    },
  });
  return { asentado: true };
}

/** La contrapartida de un cobro anulado. Sin asiento original no hay nada que revertir. */
export async function revertirCobroInTx(
  tx: Tx,
  tenantId: string,
  input: { pagoId: string; detalle: string; actor: string },
): Promise<{ revertido: boolean }> {
  const venta = await tx.cashMovement.findFirst({
    where: { tenantId, tallerPagoId: input.pagoId, type: "VENTA" },
    select: { amount: true, method: true },
  });
  if (!venta) return { revertido: false };
  const ya = await tx.cashMovement.findFirst({ where: { tenantId, tallerPagoId: input.pagoId, type: "EGRESO" }, select: { id: true } });
  if (ya) return { revertido: false };
  const session = await tx.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { id: true } });
  await tx.cashMovement.create({
    data: {
      tenantId,
      sessionId: session?.id ?? null,
      type: "EGRESO",
      method: venta.method,
      amount: venta.amount,
      reason: `Anulación · ${input.detalle}`,
      tallerPagoId: input.pagoId,
      createdBy: input.actor,
    },
  });
  return { revertido: true };
}

export interface ItemDeStock {
  tipo: string;
  decision: string;
  productId: string | null;
  traidoPorCliente: boolean;
  cantidad: number;
  descripcion: string;
}

/** Qué sale del stock al entregar: repuestos del catálogo, aprobados y puestos por el taller. PURA. */
export function repuestosADescontar(items: readonly ItemDeStock[]): { productId: string; qty: number; label: string }[] {
  const porProducto = new Map<string, { productId: string; qty: number; label: string }>();
  for (const i of items) {
    if (i.tipo !== "REPUESTO" || i.decision !== "APROBADO" || !i.productId || i.traidoPorCliente || !(i.cantidad > 0)) continue;
    const p = porProducto.get(i.productId) ?? { productId: i.productId, qty: 0, label: i.descripcion };
    p.qty += i.cantidad;
    porProducto.set(i.productId, p);
  }
  return [...porProducto.values()];
}

/** Descuenta del stock los repuestos usados. Sólo los productos que controlan existencias. */
export async function descontarRepuestosInTx(
  tx: Tx,
  tenantId: string,
  input: { numero: number; items: readonly ItemDeStock[]; actor: string },
): Promise<number> {
  const salidas = repuestosADescontar(input.items);
  if (salidas.length === 0) return 0;
  const controlados = await tx.product.findMany({
    where: { tenantId, id: { in: salidas.map((s) => s.productId) }, trackStock: true, deletedAt: null },
    select: { id: true },
  });
  const controla = new Set(controlados.map((p) => p.id));
  let n = 0;
  for (const s of salidas) {
    if (!controla.has(s.productId)) continue;
    await recordMovement(tx, {
      tenantId,
      productId: s.productId,
      type: "CONSUMO",
      qty: s.qty,
      reason: `Orden de taller #${input.numero}`,
      createdBy: input.actor,
      label: s.label,
      allowNegative: true,
    });
    n++;
  }
  return n;
}
