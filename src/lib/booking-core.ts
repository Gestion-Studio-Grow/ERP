// Núcleo de reglas de reserva, SIN "use server": son helpers puros de dominio,
// no server actions. Viven acá para que los compartan tanto las acciones del
// panel (src/lib/actions.ts) como las del sitio público (src/lib/client-actions.ts)
// sin duplicar la lógica de choques ni exponerla como endpoint RPC.

import { prisma } from "@/lib/prisma";
import { BUFFER_MIN } from "@/lib/business-config";
import { businessWallTimeToUtc, dayOfWeekForDate } from "@/lib/datetime";

// Cliente de transacción de Prisma (el `tx` que recibe $transaction). Se deriva
// del tipo de prisma para no importar el namespace generado.
export type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Devuelve la ventana de trabajo del profesional ese día según su horario
// configurado, o null si ese día no trabaja.
export async function getWorkingWindow(professionalId: string, date: string) {
  const dayOfWeek = dayOfWeekForDate(date);
  const hours = await prisma.workingHours.findUnique({
    where: { professionalId_dayOfWeek: { professionalId, dayOfWeek } },
  });
  if (!hours) return null;
  // Las horas de atención son de pared en la zona del negocio → UTC (AMD-004).
  return {
    dayStart: businessWallTimeToUtc(date, hours.startTime),
    dayEnd: businessWallTimeToUtc(date, hours.endTime),
  };
}

// Valida, DENTRO de una transacción, que la franja (profesional + box + recursos)
// esté libre para el rango [startsAt, endsAt]. Único lugar donde vive la regla de
// choques: la usan el alta (bookAppointment), la reprogramación del panel
// (rescheduleAppointment) y la reprogramación pública (rescheduleMyAppointment).
// `excludeAppointmentId` deja fuera al propio turno que se está moviendo, para que
// no choque consigo mismo. Lanza con un mensaje claro ante el primer conflicto; no
// devuelve nada si la franja está libre.
export async function assertSlotAvailable(
  tx: TxClient,
  params: {
    professionalId: string;
    boxId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    excludeAppointmentId?: string;
  }
) {
  const { professionalId, boxId, serviceId, startsAt, endsAt, excludeAppointmentId } = params;
  const notSelf = excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {};

  // Solape de profesional/box con el margen de limpieza/preparación (BUFFER_MIN).
  const bufferedStart = new Date(startsAt.getTime() - BUFFER_MIN * 60000);
  const bufferedEnd = new Date(endsAt.getTime() + BUFFER_MIN * 60000);
  const conflicts = await tx.appointment.findMany({
    where: {
      ...notSelf,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { lt: bufferedEnd },
      endsAt: { gt: bufferedStart },
      OR: [{ professionalId }, { boxId }],
    },
    select: { professionalId: true, boxId: true },
  });

  if (conflicts.some((c) => c.professionalId === professionalId)) {
    throw new Error("Ese horario ya no está disponible para este profesional. Elegí otro horario.");
  }
  if (conflicts.some((c) => c.boxId === boxId)) {
    throw new Error("El box de este profesional ya está ocupado en ese horario. Elegí otro horario.");
  }

  const boxBlocked = await tx.boxBlock.findFirst({
    where: { boxId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
  });
  if (boxBlocked) {
    throw new Error(
      `El box de este profesional no está disponible en ese horario (${boxBlocked.reason}). Elegí otro horario.`
    );
  }

  // Bloqueo del profesional (G9): franco / vacaciones / novedad.
  const professionalBlocked = await tx.professionalBlock.findFirst({
    where: { professionalId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
  });
  if (professionalBlocked) {
    throw new Error(
      `El profesional no está disponible en ese horario (${professionalBlocked.reason}). Elegí otro horario.`
    );
  }

  // Capacidad de recursos (G17): máquinas/gabinetes compartidos. No usa buffer.
  const serviceResources = await tx.serviceResource.findMany({
    where: { serviceId },
    include: { resource: true },
  });
  for (const sr of serviceResources) {
    const overlapping = await tx.appointment.findMany({
      where: {
        ...notSelf,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        service: { resources: { some: { resourceId: sr.resourceId } } },
      },
      select: {
        service: { select: { resources: { where: { resourceId: sr.resourceId }, select: { units: true } } } },
      },
    });
    const used = overlapping.reduce((sum, a) => sum + (a.service.resources[0]?.units ?? 0), 0);
    if (used + sr.units > sr.resource.quantity) {
      throw new Error(
        `No hay "${sr.resource.name}" disponible en ese horario (capacidad completa). Elegí otro horario.`
      );
    }
  }
}
