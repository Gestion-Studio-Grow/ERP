// El cupón de una reserva de turno, DENTRO de su transacción (ADR-014, ENG-109).
//
// Se lee, se decide con `aplicarCupon` (camino "turno": el % al peso) y, sólo si descuenta algo,
// se gasta un uso. Si no vale (no existe, apagado, vencido, agotado) o no llega a descontar nada,
// la reserva sigue sin cupón y el uso NO se gasta: antes un 5 % sobre $9 se aplicaba en $0 y
// dejaba gastado un cupón de un solo uso.
//
// Sin "use server": `tenantId` llega por parámetro y no puede quedar publicado como acción. La
// transacción es la de `bookAppointment` (Serializable, `bookingTransaction`): si dos reservas se
// llevan el último uso a la vez, una aborta y reintenta viendo el uso ya gastado.

import type { Prisma } from "@/generated/prisma/client";
import { aplicarCupon } from "@/lib/venta-reglas";

export type CuponDeLaReserva = { codigo: string; descuento: number };

export async function cuponDeLaReserva(
  tx: Pick<Prisma.TransactionClient, "coupon">,
  p: { tenantId: string; codigo: string | null | undefined; base: number; ahora: Date },
): Promise<CuponDeLaReserva | null> {
  const code = p.codigo?.trim().toUpperCase();
  if (!code) return null;
  const cupon = await tx.coupon.findUnique({ where: { tenantId_code: { tenantId: p.tenantId, code } } });
  const r = aplicarCupon({ cupon, base: p.base, ahora: p.ahora, camino: "turno" });
  if (!r.ok || !cupon) return null;
  await tx.coupon.update({ where: { id: cupon.id }, data: { usedCount: { increment: 1 } } });
  return { codigo: r.codigo, descuento: r.descuento };
}
