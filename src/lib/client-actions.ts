"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

  await prisma.review.create({
    data: {
      appointmentId,
      professionalId: appointment.professionalId,
      clientName: appointment.client.name,
      rating,
      comment: comment || null,
    },
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
  revalidatePath(`/reserva/turno/${id}`);
  revalidatePath("/admin/turnos");
}
