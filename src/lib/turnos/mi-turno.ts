// ============================================================================
// "TU TURNO" — lo que la página pública del turno lee, y nada más.
// ============================================================================
//
// `getMyAppointment` (client-actions.ts) es un endpoint PÚBLICO: quien tenga el link del turno
// lo invoca, y el link se reenvía por WhatsApp. Traía `professional: true` entero —email,
// teléfono, `commissionPercent`— más el pago completo y toda la fila del turno, y todo eso
// viajaba en la respuesta de la acción aunque la pantalla muestre sólo el nombre. Ahora la
// lectura trae lo que usa la página (reserva/turno/[id]/page.tsx) y los botones de cancelar,
// reprogramar y reseñar.
//
// Sin "use server" y sin Prisma de valor: recibe la base, así un test ejecuta la lectura.

import type { Prisma } from "@/generated/prisma/client";

export const SELECT_MI_TURNO = {
  id: true,
  status: true,
  startsAt: true,
  professionalId: true,
  serviceId: true,
  service: { select: { name: true } },
  professional: { select: { name: true } },
  box: { select: { name: true } },
  review: { select: { rating: true } },
} as const satisfies Prisma.AppointmentSelect;

/** El turno `id` del negocio, con lo que muestra la página pública, o null. */
export function leerMiTurno(
  db: { appointment: { findFirst(a: { where: { id: string; tenantId: string }; select: typeof SELECT_MI_TURNO }): Promise<unknown> } },
  tenantId: string,
  id: string,
) {
  return db.appointment.findFirst({ where: { id, tenantId }, select: SELECT_MI_TURNO }) as Promise<Prisma.AppointmentGetPayload<{
    select: typeof SELECT_MI_TURNO;
  }> | null>;
}
