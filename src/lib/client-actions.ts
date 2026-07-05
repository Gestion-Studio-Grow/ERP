"use server";

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { revalidatePath } from "next/cache";
import { auditPublic } from "@/lib/audit";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";

export async function getMyAppointment(id: string) {
  return prisma.appointment.findUnique({
    where: { id },
    include: { client: true, professional: true, service: true, box: true, payment: true, review: true },
  });
}

export async function createReview(formData: FormData) {
  const appointmentId = String(formData.get("appointmentId"));
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") || "").trim();

  if (rating < 1 || rating > 5) {
    throw new Error("La calificación debe ser de 1 a 5 estrellas.");
  }

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { client: true, review: true },
  });

  if (appointment.status !== "COMPLETED") {
    throw new Error("Solo se puede dejar una reseña de un turno ya realizado.");
  }
  if (appointment.review) {
    throw new Error("Ya dejaste una reseña para este turno.");
  }

  const review = await prisma.review.create({
    data: {
      tenantId: appointment.tenantId,
      appointmentId,
      professionalId: appointment.professionalId,
      clientName: appointment.client.name,
      rating,
      comment: comment || null,
    },
  });

  await auditPublic({
    action: "create",
    entity: "Review",
    entityId: review.id,
    clientPhone: appointment.client.phone,
    changes: { rating, appointmentId },
  });

  revalidatePath(`/reserva/turno/${appointmentId}`);
}

export async function cancelMyAppointment(formData: FormData) {
  const id = String(formData.get("id"));

  const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id } });

  if (appointment.status === "CANCELLED") {
    throw new Error("Este turno ya estaba cancelado.");
  }
  if (appointment.status === "COMPLETED") {
    throw new Error("Este turno ya se realizó, no se puede cancelar.");
  }
  if (appointment.startsAt.getTime() < Date.now()) {
    throw new Error("No se puede cancelar un turno que ya pasó.");
  }

  await prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } });
  await auditPublic({ action: "cancel", entity: "Appointment", entityId: id });
  revalidatePath(`/reserva/turno/${id}`);
  revalidatePath("/admin/turnos");
}

// El cliente mueve su propio turno a otra fecha/hora desde el link de "Tu turno",
// sin cancelar + volver a reservar (que le hacía perder el horario si otro lo
// tomaba en el medio). Conserva profesional, servicio, precio congelado, estado y
// pago: solo cambia el horario. La validación de choques es la misma del alta
// (assertSlotAvailable), excluyendo el propio turno. No usa requireCapability: es
// acción pública, autorizada por poseer el id del turno (igual que cancelar).
export async function rescheduleMyAppointment(formData: FormData) {
  const id = String(formData.get("id"));
  const startsAtIso = String(formData.get("startsAt"));
  if (!id || !startsAtIso) {
    throw new Error("Elegí un nuevo horario para reprogramar.");
  }

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id },
    include: { service: true, professional: { include: { box: true } } },
  });

  // Mismos estados que se pueden cancelar: solo turnos vivos y futuros.
  if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
    throw new Error("Este turno no se puede reprogramar.");
  }
  if (appointment.startsAt.getTime() < Date.now()) {
    throw new Error("No se puede reprogramar un turno que ya pasó.");
  }

  const startsAt = new Date(startsAtIso);
  if (startsAt.getTime() < Date.now()) {
    throw new Error("Elegí un horario futuro.");
  }
  const endsAt = new Date(startsAt.getTime() + appointment.service.durationMin * 60000);

  const { professional } = appointment;
  if (!professional.active || professional.deletedAt) {
    throw new Error("Ese profesional ya no está disponible.");
  }
  if (!professional.boxId || !professional.box?.active || professional.box?.deletedAt) {
    throw new Error("Ese profesional no tiene un box activo asignado.");
  }
  const boxId = professional.boxId;

  // El profesional debe trabajar en ese horario (misma regla que el alta).
  const dateStr = dateStrInBusinessTz(startsAt);
  const window = await getWorkingWindow(professional.id, dateStr);
  if (!window || startsAt < window.dayStart || endsAt > window.dayEnd) {
    throw new Error("Ese horario no está disponible. Elegí otro.");
  }

  await tenantTransaction(async (tx) => {
    await assertSlotAvailable(tx, {
      professionalId: professional.id,
      boxId,
      serviceId: appointment.serviceId,
      startsAt,
      endsAt,
      excludeAppointmentId: id,
    });

    await tx.appointment.update({
      where: { id },
      data: { startsAt, endsAt },
    });
  });

  await auditPublic({
    action: "reschedule",
    entity: "Appointment",
    entityId: id,
    changes: { from: { startsAt: appointment.startsAt }, to: { startsAt } },
  });

  revalidatePath(`/reserva/turno/${id}`);
  revalidatePath("/admin/turnos");
}
