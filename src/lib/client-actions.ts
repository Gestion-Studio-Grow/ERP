"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getMyAppointment(id: string) {
  return prisma.appointment.findUnique({
    where: { id },
    include: { client: true, professional: true, service: true, box: true, payment: true },
  });
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
