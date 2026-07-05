"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";
import { getAvailableSlots } from "@/lib/actions";
import { dateStrInBusinessTz } from "@/lib/datetime";

const WAITLIST_PATH = "/admin/espera";

// Lista de espera para el panel: los que todavía esperan (WAITING) primero, luego
// los ya avisados (NOTIFIED), ambos en orden de llegada (FIFO — el que hace más
// que espera va arriba). Los resueltos (BOOKED/CANCELLED) no se muestran acá.
export async function getWaitlist() {
  await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();
  return prisma.waitlistEntry.findMany({
    where: { tenantId, status: { in: ["WAITING", "NOTIFIED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { service: true, professional: true },
  });
}

// Catálogo para el formulario de alta: servicios y profesionales activos. El
// select de profesional incluye "cualquiera" (professionalId vacío) en la UI.
export async function getWaitlistFormData() {
  await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();
  const [services, professionals] = await Promise.all([
    prisma.service.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.professional.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { services, professionals };
}

// Anota a alguien en la lista de espera. Datos de contacto sueltos (no exige que
// sea un Client existente — ver nota en el modelo). El profesional es opcional.
export async function addToWaitlist(formData: FormData) {
  await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();

  const clientName = String(formData.get("clientName") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim() || null;
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const professionalId = String(formData.get("professionalId") ?? "").trim() || null;
  const preferenceNote = String(formData.get("preferenceNote") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!clientName || !clientPhone) {
    throw new Error("Nombre y teléfono son obligatorios para anotar en la lista de espera.");
  }
  if (!serviceId) {
    throw new Error("Elegí el servicio que la persona está esperando.");
  }

  // El servicio y (si se eligió) el profesional tienen que ser del tenant — evita
  // que un id manipulado enlace a otro negocio.
  const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId } });
  if (!service) throw new Error("Ese servicio no existe.");
  if (professionalId) {
    const prof = await prisma.professional.findFirst({ where: { id: professionalId, tenantId } });
    if (!prof) throw new Error("Ese profesional no existe.");
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      tenantId,
      clientName,
      clientPhone,
      clientEmail,
      serviceId,
      professionalId,
      preferenceNote,
      notes,
    },
  });

  await auditAdmin({
    action: "create",
    entity: "WaitlistEntry",
    entityId: entry.id,
    changes: { clientName, serviceId, professionalId },
  });

  revalidatePath(WAITLIST_PATH);
}

// Marca que ya se le avisó a la persona que se liberó un hueco (sin reservar
// todavía). Solo tiene sentido desde WAITING.
export async function markWaitlistNotified(formData: FormData) {
  await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id"));
  // updateMany con el tenantId en el where: no toca filas de otro tenant.
  await prisma.waitlistEntry.updateMany({
    where: { id, tenantId, status: "WAITING" },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });
  await auditAdmin({ action: "notify", entity: "WaitlistEntry", entityId: id });
  revalidatePath(WAITLIST_PATH);
}

// Da de baja un anotado (ya no quiere / se resolvió por otro lado).
export async function cancelWaitlistEntry(formData: FormData) {
  await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id"));
  await prisma.waitlistEntry.updateMany({
    where: { id, tenantId, status: { in: ["WAITING", "NOTIFIED"] } },
    data: { status: "CANCELLED", resolvedAt: new Date() },
  });
  await auditAdmin({ action: "cancel", entity: "WaitlistEntry", entityId: id });
  revalidatePath(WAITLIST_PATH);
}

// Busca horarios libres reales para un anotado en una fecha dada. Reusa la
// disponibilidad del motor de reservas (getAvailableSlots), que ya respeta
// horario del profesional, choques, buffer, bloqueos y capacidad de recursos.
// Si el anotado eligió profesional, busca solo ese; si no ("cualquiera"), busca
// en todos los profesionales activos que presten el servicio. Es solo lectura.
export async function findSlotsForWaitlistEntry(entryId: string, date: string) {
  await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();

  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: entryId, tenantId },
    include: { service: true },
  });
  if (!entry) throw new Error("Ese anotado ya no está en la lista.");

  // Profesionales candidatos: el preferido, o todos los que prestan el servicio.
  const professionals = await prisma.professional.findMany({
    where: {
      tenantId,
      active: true,
      deletedAt: null,
      services: { some: { id: entry.serviceId } },
      ...(entry.professionalId ? { id: entry.professionalId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const results = await Promise.all(
    professionals.map(async (p) => ({
      professionalId: p.id,
      professionalName: p.name,
      slots: await getAvailableSlots(p.id, entry.serviceId, date),
    }))
  );
  // Solo devolvemos profesionales que tienen al menos un hueco ese día.
  return results.filter((r) => r.slots.length > 0);
}

// Convierte un anotado en un turno real. Hace el upsert del Client por teléfono
// (mismo criterio que el turno manual) y crea el turno dentro de una transacción,
// re-validando la disponibilidad con assertSlotAvailable para cerrar la carrera
// entre "vi el hueco" y "reservo". No pasa por src/lib/actions.ts a propósito
// (rama de comisiones trabaja ahí) — reusa solo el núcleo de dominio de
// booking-core. Sin cupón/precio vecino: es una reserva de mostrador simple con
// el precio general congelado; recepción ajusta después si hace falta.
export async function bookFromWaitlist(formData: FormData) {
  await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();

  const entryId = String(formData.get("entryId"));
  const professionalId = String(formData.get("professionalId"));
  const startsAtIso = String(formData.get("startsAt"));

  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: entryId, tenantId, status: { in: ["WAITING", "NOTIFIED"] } },
  });
  if (!entry) throw new Error("Ese anotado ya no está disponible para reservar.");

  const [service, professional] = await Promise.all([
    prisma.service.findFirstOrThrow({ where: { id: entry.serviceId, tenantId } }),
    prisma.professional.findFirstOrThrow({
      where: { id: professionalId, tenantId },
      include: { box: true },
    }),
  ]);

  if (!professional.active || professional.deletedAt) {
    throw new Error("Ese profesional ya no está disponible.");
  }
  if (!professional.boxId || !professional.box?.active || professional.box?.deletedAt) {
    throw new Error("Ese profesional no tiene un box activo asignado.");
  }
  // El profesional tiene que prestar el servicio esperado.
  const prestaElServicio = await prisma.professional.findFirst({
    where: { id: professionalId, tenantId, services: { some: { id: entry.serviceId } } },
    select: { id: true },
  });
  if (!prestaElServicio) {
    throw new Error("Ese profesional no realiza el servicio de este anotado.");
  }

  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) throw new Error("Horario inválido.");
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60000);
  const boxId = professional.boxId;

  // El turno tiene que caer dentro del horario de trabajo del profesional ese día.
  const dateStr = dateStrInBusinessTz(startsAt);
  const window = await getWorkingWindow(professionalId, dateStr);
  if (!window || startsAt < window.dayStart || endsAt > window.dayEnd) {
    throw new Error("Ese profesional no trabaja en ese horario. Elegí otro.");
  }

  const appointment = await tenantTransaction(async (tx) => {
    await assertSlotAvailable(tx, {
      professionalId,
      boxId,
      serviceId: entry.serviceId,
      startsAt,
      endsAt,
    });

    // Upsert del cliente por teléfono (igual criterio que el alta manual/pública).
    let client = await tx.client.findFirst({ where: { tenantId, phone: entry.clientPhone } });
    if (!client) {
      client = await tx.client.create({
        data: {
          tenantId,
          name: entry.clientName,
          phone: entry.clientPhone,
          email: entry.clientEmail ?? undefined,
        },
      });
    }

    const appt = await tx.appointment.create({
      data: {
        tenantId,
        clientId: client.id,
        professionalId,
        serviceId: entry.serviceId,
        boxId,
        startsAt,
        endsAt,
        status: "CONFIRMED",
        priceAtBooking: service.price,
      },
    });

    // El anotado queda resuelto y sale de la lista, con rastro del turno.
    await tx.waitlistEntry.update({
      where: { id: entry.id },
      data: {
        status: "BOOKED",
        resolvedAt: new Date(),
        bookedAppointmentId: appt.id,
        // Si no había profesional preferido, queda registrado con quién se resolvió.
        professionalId,
      },
    });

    return appt;
  });

  await auditAdmin({
    action: "book_from_waitlist",
    entity: "Appointment",
    entityId: appointment.id,
    changes: { waitlistEntryId: entry.id, professionalId, startsAt: appointment.startsAt },
  });

  revalidatePath(WAITLIST_PATH);
  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
}
