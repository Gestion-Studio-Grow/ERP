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
import { pendienteDeRendirDeLectura } from "@/lib/comisiones/rendicion-repo";
import { comisionesPendientes, contarTurnosEsperandoSaldo, whereTurnosConComisionPendiente, type ComisionPendiente, type TurnoPendiente } from "./comisiones";

async function leerTurnos(
  db: Prisma.TransactionClient,
  where: Prisma.AppointmentWhereInput & { tenantId: string },
  conRendicion = true,
): Promise<{ turnos: TurnoPendiente[]; overrides: Map<string, Map<string, number>> }> {
  const turnos = await db.appointment.findMany({
    where,
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
      service: { select: { price: true, name: true } },
      client: { select: { name: true } },
    },
  });
  const pendienteDeRendir = conRendicion
    ? await pendienteDeRendirDeLectura(db, where.tenantId, turnos.map((t) => t.id))
    : new Map<string, number>();
  const overrides = new Map<string, Map<string, number>>();
  for (const t of turnos) {
    if (overrides.has(t.professionalId)) continue;
    overrides.set(
      t.professionalId,
      new Map((t.professional?.serviceCommissions ?? []).map((o) => [o.serviceId, o.commissionPercent])),
    );
  }
  return {
    overrides,
    turnos: turnos.map((t) => ({
      id: t.id,
      serviceId: t.serviceId,
      startsAt: t.startsAt,
      professionalId: t.professionalId,
      professionalName: t.professional?.name ?? "Profesional",
      pctGeneral: t.professional?.commissionPercent ?? 0,
      precio: aNumero(t.priceAtBooking ?? t.service?.price),
      cobros: (t.collections ?? []).map((c) => ({ amount: aNumero(c.amount), method: c.method })),
      payment: t.payment ? { status: t.payment.status, amount: aNumero(t.payment.amount) } : null,
      servicio: t.service?.name,
      clienta: t.client?.name,
      pendienteDeRendir: pendienteDeRendir.get(t.id) ?? 0,
    })),
  };
}

export async function leerComisionesPendientes(
  db: Prisma.TransactionClient,
  tenantId: string,
): Promise<ComisionPendiente[]> {
  const { turnos, overrides } = await leerTurnos(db, whereTurnosConComisionPendiente(tenantId));
  return comisionesPendientes(turnos, overrides);
}

/**
 * Los turnos con comisión pendiente tal cual, para la vista previa del período y «Mi liquidación»
 * (comisiones/vista-previa.ts). El MISMO `where` que la liquidación; `professionalId` acota a una
 * sola profesional (la de la sesión, en «Mi liquidación»).
 */
export function leerTurnosPendientes(
  db: Prisma.TransactionClient,
  tenantId: string,
  professionalId?: string,
): Promise<{ turnos: TurnoPendiente[]; overrides: Map<string, Map<string, number>> }> {
  const where = whereTurnosConComisionPendiente(tenantId);
  return leerTurnos(db, professionalId ? { ...where, professionalId } : where);
}

/** Los turnos terminados y sin liquidar que esperan a que se cobre el saldo, con o sin cobro todavía. */
export async function leerTurnosEsperandoSaldo(db: Prisma.TransactionClient, tenantId: string): Promise<number> {
  // Sólo cuenta el saldo: lo pendiente de rendir no entra en esta cuenta.
  const { turnos, overrides } = await leerTurnos(db, { tenantId, status: "COMPLETED", commissionPayoutId: null }, false);
  return contarTurnosEsperandoSaldo(turnos, overrides);
}
