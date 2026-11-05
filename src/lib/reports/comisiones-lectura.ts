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
import { nailArtistDe } from "./rendiciones-lectura";
import { comisionesPendientes, contarTurnosEsperandoSaldo, whereTurnosConComisionPendiente, type ComisionPendiente, type TurnoPendiente } from "./comisiones";

async function leerTurnos(
  db: Prisma.TransactionClient,
  where: Prisma.AppointmentWhereInput,
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
    })),
  };
}

// Una vez que la columna existe no deja de existir (migración aditiva): se cachea sólo el «sí».
let columnaDeRendicionVista = false;

/**
 * ¿Existe `Appointment.settlementId` (migración `20261105120000_nail_artist`)? Mira el catálogo, no
 * los datos. Ante un error responde «no» (sin la columna, el filtro rompería la lectura con P2022).
 */
export async function hayColumnaDeRendicion(db: Prisma.TransactionClient): Promise<boolean> {
  if (columnaDeRendicionVista) return true;
  try {
    const filas = await db.$queryRaw<{ n: number }[]>`
      SELECT 1 AS n FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Appointment' AND column_name = 'settlementId' LIMIT 1`;
    columnaDeRendicionVista = filas.length > 0;
  } catch {
    return false;
  }
  return columnaDeRendicionVista;
}

/** El `where` de comisión pendiente con el interruptor y la columna de rendición resueltos. */
export async function whereComisionPendienteDe(db: Prisma.TransactionClient, tenantId: string, nailArtist?: boolean) {
  const prendido = nailArtist ?? (await nailArtistDe(db, tenantId));
  return whereTurnosConComisionPendiente(tenantId, prendido, prendido || (await hayColumnaDeRendicion(db)));
}

export async function leerComisionesPendientes(
  db: Prisma.TransactionClient,
  tenantId: string,
): Promise<ComisionPendiente[]> {
  // El KPI del Inicio, la pantalla y la liquidación: el MISMO filtro del box «Nail Artist».
  const { turnos, overrides } = await leerTurnos(db, await whereComisionPendienteDe(db, tenantId));
  return comisionesPendientes(turnos, overrides);
}

/** Los turnos terminados y sin liquidar que esperan a que se cobre el saldo, con o sin cobro todavía. */
export async function leerTurnosEsperandoSaldo(db: Prisma.TransactionClient, tenantId: string): Promise<number> {
  const { turnos, overrides } = await leerTurnos(db, { tenantId, status: "COMPLETED", commissionPayoutId: null });
  return contarTurnosEsperandoSaldo(turnos, overrides);
}
