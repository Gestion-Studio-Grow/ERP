// ============================================================================
// LECTURA de las comisiones pendientes — una consulta, para la pantalla y el botón.
// ============================================================================
//
// Los turnos con comisión pendiente (`whereTurnosConComisionPendiente`, el mismo `where` que
// la liquidación) con todo lo que hace falta para calcular: el profesional con su % y los %
// por servicio, el pago, los cobros parciales y el precio. Todo en UNA consulta con sus
// relaciones; el cálculo es el de la liquidación (`comisionesPendientes`).
//
// Sin "use server" ni "server-only" (ver debts/cuentas-lectura.ts).

import type { Prisma } from "@/generated/prisma/client";
import { aNumero } from "@/lib/debts/resumen-cuentas";
import { comisionesPendientes, whereTurnosConComisionPendiente, type ComisionPendiente } from "./comisiones";

export async function leerComisionesPendientes(
  db: Prisma.TransactionClient,
  tenantId: string,
): Promise<ComisionPendiente[]> {
  const turnos = await db.appointment.findMany({
    where: whereTurnosConComisionPendiente(tenantId),
    select: {
      id: true,
      serviceId: true,
      startsAt: true,
      priceAtBooking: true,
      professionalId: true,
      professional: {
        select: {
          name: true,
          commissionPercent: true,
          serviceCommissions: { select: { serviceId: true, commissionPercent: true } },
        },
      },
      payment: { select: { status: true, amount: true } },
      collections: { select: { amount: true, method: true } },
      service: { select: { price: true } },
    },
  });
  const overrides = new Map<string, Map<string, number>>();
  for (const t of turnos) {
    if (overrides.has(t.professionalId)) continue;
    overrides.set(
      t.professionalId,
      new Map((t.professional?.serviceCommissions ?? []).map((o) => [o.serviceId, o.commissionPercent])),
    );
  }
  return comisionesPendientes(
    turnos.map((t) => ({
      id: t.id,
      serviceId: t.serviceId,
      startsAt: t.startsAt,
      professionalId: t.professionalId,
      professionalName: t.professional?.name ?? "Profesional",
      pctGeneral: t.professional?.commissionPercent ?? 0,
      precio: aNumero(t.priceAtBooking ?? t.service?.price),
      cobros: (t.collections ?? []).map((c) => ({ amount: aNumero(c.amount), method: c.method })),
      payment: t.payment ? { status: t.payment.status, amount: aNumero(t.payment.amount) } : null,
    })),
    overrides,
  );
}
