"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function getProfessionalsWithServices() {
  return prisma.professional.findMany({
    where: { active: true },
    include: { services: { where: { active: true } }, box: true },
  });
}

export async function getAvailableSlots(professionalId: string, serviceId: string, date: string) {
  const [service, professional] = await Promise.all([
    prisma.service.findUniqueOrThrow({ where: { id: serviceId } }),
    prisma.professional.findUniqueOrThrow({ where: { id: professionalId } }),
  ]);
  const dayStart = new Date(`${date}T09:00:00`);
  const dayEnd = new Date(`${date}T19:00:00`);

  const [existing, boxBlocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: dayStart, lt: dayEnd },
        OR: [{ professionalId }, ...(professional.boxId ? [{ boxId: professional.boxId }] : [])],
      },
      select: { startsAt: true, endsAt: true },
    }),
    professional.boxId
      ? prisma.boxBlock.findMany({
          where: {
            boxId: professional.boxId,
            startsAt: { lt: dayEnd },
            endsAt: { gt: dayStart },
          },
          select: { startsAt: true, endsAt: true },
        })
      : Promise.resolve([]),
  ]);
  const busy = [...existing, ...boxBlocks];

  const slots: string[] = [];
  const stepMin = 30;
  for (
    let t = new Date(dayStart);
    t.getTime() + service.durationMin * 60000 <= dayEnd.getTime();
    t = new Date(t.getTime() + stepMin * 60000)
  ) {
    const slotEnd = new Date(t.getTime() + service.durationMin * 60000);
    const overlaps = busy.some((a) => t < a.endsAt && slotEnd > a.startsAt);
    if (!overlaps) slots.push(t.toISOString());
  }
  return slots;
}

export async function createAppointment(formData: FormData) {
  const professionalId = String(formData.get("professionalId"));
  const serviceId = String(formData.get("serviceId"));
  const startsAtIso = String(formData.get("startsAt"));
  const clientName = String(formData.get("clientName"));
  const clientPhone = String(formData.get("clientPhone"));
  const clientEmail = String(formData.get("clientEmail") || "");

  const [service, professional] = await Promise.all([
    prisma.service.findUniqueOrThrow({ where: { id: serviceId } }),
    prisma.professional.findUniqueOrThrow({ where: { id: professionalId }, include: { box: true } }),
  ]);

  if (!professional.active) {
    throw new Error("Este profesional ya no está disponible para reservas.");
  }
  if (!service.active) {
    throw new Error("Este servicio ya no está disponible.");
  }
  if (!professional.boxId || !professional.box?.active) {
    throw new Error("Este profesional no tiene un box activo asignado. Contactanos para coordinar tu turno.");
  }

  const startsAt = new Date(startsAtIso);
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60000);
  const boxId = professional.boxId;

  let client = await prisma.client.findFirst({ where: { phone: clientPhone } });
  if (!client) {
    client = await prisma.client.create({
      data: { name: clientName, phone: clientPhone, email: clientEmail || undefined },
    });
  }
  const clientId = client.id;

  const appointment = await prisma.$transaction(async (tx) => {
    // Re-check availability inside the transaction to close the race window
    // between "show free slots" and "write the booking" — two requests
    // landing on the same slot must not both succeed.
    const conflicts = await tx.appointment.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [{ professionalId }, { boxId }],
      },
      select: { professionalId: true, boxId: true },
    });

    const professionalTaken = conflicts.some((c) => c.professionalId === professionalId);
    const boxTaken = conflicts.some((c) => c.boxId === boxId);

    if (professionalTaken) {
      throw new Error("Ese horario ya no está disponible para este profesional. Elegí otro horario.");
    }
    if (boxTaken) {
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

    return tx.appointment.create({
      data: {
        clientId,
        professionalId,
        serviceId,
        boxId,
        startsAt,
        endsAt,
        status: "PENDING",
      },
    });
  });

  redirect(`/reserva/confirmacion/${appointment.id}`);
}

export async function getAppointments() {
  return prisma.appointment.findMany({
    orderBy: { startsAt: "asc" },
    include: { client: true, professional: true, service: true, box: true, payment: true },
  });
}

export async function confirmPayment(formData: FormData) {
  const appointmentId = String(formData.get("appointmentId"));
  const method = String(formData.get("method")) as "MERCADOPAGO" | "EFECTIVO" | "TRANSFERENCIA";

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { service: true },
  });

  await prisma.payment.upsert({
    where: { appointmentId },
    create: {
      appointmentId,
      amount: appointment.service.price,
      method,
      status: "APPROVED",
      comprobanteNro: `REC-${Date.now()}`,
    },
    update: {
      method,
      status: "APPROVED",
    },
  });

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CONFIRMED" },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/reportes");
}

export async function getReportData() {
  const payments = await prisma.payment.findMany({
    where: { status: "APPROVED" },
    include: {
      appointment: {
        include: { professional: true, service: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalIngresos = payments.reduce((sum, p) => sum + p.amount, 0);

  const porDia = new Map<string, number>();
  const porProfesional = new Map<string, number>();
  const porServicio = new Map<string, number>();
  const comisionPorProfesional = new Map<string, { comision: number; ingresos: number }>();

  for (const p of payments) {
    const day = p.appointment.startsAt.toISOString().slice(0, 10);
    porDia.set(day, (porDia.get(day) ?? 0) + p.amount);

    const prof = p.appointment.professional.name;
    porProfesional.set(prof, (porProfesional.get(prof) ?? 0) + p.amount);

    const serv = p.appointment.service.name;
    porServicio.set(serv, (porServicio.get(serv) ?? 0) + p.amount);

    // La comisión solo se devenga sobre turnos efectivamente realizados
    // (COMPLETED), no sobre cualquier pago aprobado — un turno pagado pero
    // que todavía no se hizo no genera comisión.
    if (p.appointment.status === "COMPLETED" && p.appointment.professional.commissionPercent > 0) {
      const current = comisionPorProfesional.get(prof) ?? { comision: 0, ingresos: 0 };
      current.ingresos += p.amount;
      current.comision += (p.amount * p.appointment.professional.commissionPercent) / 100;
      comisionPorProfesional.set(prof, current);
    }
  }

  const toSortedArray = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total);

  return {
    totalIngresos,
    cantidadPagos: payments.length,
    porDia: Array.from(porDia.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => (a.label < b.label ? 1 : -1)),
    porProfesional: toSortedArray(porProfesional),
    porServicio: toSortedArray(porServicio),
    comisiones: Array.from(comisionPorProfesional.entries())
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.comision - a.comision),
  };
}

export async function cancelAppointment(formData: FormData) {
  const appointmentId = String(formData.get("appointmentId"));
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
}

export async function completeAppointment(formData: FormData) {
  const appointmentId = String(formData.get("appointmentId"));

  await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { service: { include: { products: { include: { product: true } } } } },
    });

    if (appointment.status !== "CONFIRMED") {
      throw new Error("Solo se puede completar un turno que esté confirmado.");
    }

    for (const usage of appointment.service.products) {
      await tx.product.update({
        where: { id: usage.productId },
        data: { stock: { decrement: usage.quantity } },
      });
    }

    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "COMPLETED" },
    });
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/reportes");
}

export async function getClients() {
  return prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { appointments: { select: { id: true } } },
  });
}

export async function getClient(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      appointments: {
        orderBy: { startsAt: "desc" },
        include: { professional: true, service: true, payment: true },
      },
    },
  });
}

export async function getAgendaDay(date: string) {
  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [professionals, appointments] = await Promise.all([
    prisma.professional.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { box: true },
    }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
      include: { client: true, professional: true, service: true, payment: true, box: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  return { professionals, appointments };
}

export async function getDashboardData() {
  const now = new Date();
  const todayStart = new Date(now.toISOString().slice(0, 10) + "T00:00:00");
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [todayAppointments, pendingCount, weekPayments, professionalsCount, clientsCount] =
    await Promise.all([
      prisma.appointment.findMany({
        where: { startsAt: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } },
        include: { client: true, professional: true, service: true },
        orderBy: { startsAt: "asc" },
      }),
      prisma.appointment.count({ where: { status: "PENDING" } }),
      prisma.payment.findMany({
        where: { status: "APPROVED", createdAt: { gte: weekStart } },
        select: { amount: true },
      }),
      prisma.professional.count({ where: { active: true } }),
      prisma.client.count(),
    ]);

  return {
    todayAppointments,
    pendingCount,
    weekRevenue: weekPayments.reduce((sum, p) => sum + p.amount, 0),
    professionalsCount,
    clientsCount,
  };
}
