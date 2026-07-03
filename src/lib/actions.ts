"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { BUFFER_MIN } from "@/lib/business-config";
import {
  businessWallTimeToUtc,
  dayOfWeekForDate,
  todayInBusinessTz,
  dateStrInBusinessTz,
} from "@/lib/datetime";
import { auditAdmin, auditPublic } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";

export async function getProfessionalsWithServices() {
  return prisma.professional.findMany({
    where: { active: true, deletedAt: null },
    include: { services: { where: { active: true, deletedAt: null } }, box: true },
  });
}

// Devuelve la ventana de trabajo del profesional ese día según su horario
// configurado, o null si ese día no trabaja.
async function getWorkingWindow(professionalId: string, date: string) {
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

export async function getAvailableSlots(professionalId: string, serviceId: string, date: string) {
  const [service, professional, window] = await Promise.all([
    prisma.service.findUniqueOrThrow({ where: { id: serviceId } }),
    prisma.professional.findUniqueOrThrow({ where: { id: professionalId } }),
    getWorkingWindow(professionalId, date),
  ]);
  if (!window) return [];
  const { dayStart, dayEnd } = window;

  // Recursos que consume este servicio (G17): máquinas/gabinetes con capacidad.
  const serviceResources = await prisma.serviceResource.findMany({
    where: { serviceId },
    include: { resource: true },
  });
  const resourceIds = serviceResources.map((sr) => sr.resourceId);

  const [existing, boxBlocks, professionalBlocks, resourceUsage] = await Promise.all([
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
    // Bloqueos del profesional ese día (G9): franco / vacaciones / novedad.
    prisma.professionalBlock.findMany({
      where: { professionalId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      select: { startsAt: true, endsAt: true },
    }),
    // Turnos del día que usan alguno de los recursos que necesita este servicio,
    // con las unidades que consume cada uno (para medir ocupación por franja).
    resourceIds.length > 0
      ? prisma.appointment.findMany({
          where: {
            status: { in: ["PENDING", "CONFIRMED"] },
            startsAt: { gte: dayStart, lt: dayEnd },
            service: { resources: { some: { resourceId: { in: resourceIds } } } },
          },
          select: {
            startsAt: true,
            endsAt: true,
            service: {
              select: { resources: { where: { resourceId: { in: resourceIds } }, select: { resourceId: true, units: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  // Los turnos reales suman un margen de limpieza/preparación antes y
  // después; los bloqueos de box/profesional ya son rangos explícitos y no
  // necesitan margen extra.
  const busy = [
    ...existing.map((a) => ({
      startsAt: new Date(a.startsAt.getTime() - BUFFER_MIN * 60000),
      endsAt: new Date(a.endsAt.getTime() + BUFFER_MIN * 60000),
    })),
    ...boxBlocks,
    ...professionalBlocks,
  ];

  const slots: string[] = [];
  const stepMin = 30;
  for (
    let t = new Date(dayStart);
    t.getTime() + service.durationMin * 60000 <= dayEnd.getTime();
    t = new Date(t.getTime() + stepMin * 60000)
  ) {
    const slotEnd = new Date(t.getTime() + service.durationMin * 60000);
    if (busy.some((a) => t < a.endsAt && slotEnd > a.startsAt)) continue;

    // Capacidad de recursos (G17): para cada recurso requerido, la suma de
    // unidades de los turnos que se solapan más lo que este turno consume no
    // puede superar la cantidad disponible.
    let resourceOk = true;
    for (const sr of serviceResources) {
      const overlapUnits = resourceUsage
        .filter((a) => t < a.endsAt && slotEnd > a.startsAt)
        .reduce((sum, a) => {
          const link = a.service.resources.find((r) => r.resourceId === sr.resourceId);
          return sum + (link?.units ?? 0);
        }, 0);
      if (overlapUnits + sr.units > sr.resource.quantity) {
        resourceOk = false;
        break;
      }
    }
    if (resourceOk) slots.push(t.toISOString());
  }
  return slots;
}

type BookingStatus = "PENDING" | "CONFIRMED";

async function bookAppointment({
  professionalId,
  serviceId,
  startsAtIso,
  clientId,
  status,
  notes,
}: {
  professionalId: string;
  serviceId: string;
  startsAtIso: string;
  clientId: string;
  status: BookingStatus;
  notes?: string;
}) {
  const [service, professional] = await Promise.all([
    prisma.service.findUniqueOrThrow({ where: { id: serviceId } }),
    prisma.professional.findUniqueOrThrow({ where: { id: professionalId }, include: { box: true } }),
  ]);

  if (!professional.active || professional.deletedAt) {
    throw new Error("Este profesional ya no está disponible para reservas.");
  }
  if (!service.active || service.deletedAt) {
    throw new Error("Este servicio ya no está disponible.");
  }
  if (!professional.boxId || !professional.box?.active || professional.box?.deletedAt) {
    throw new Error("Este profesional no tiene un box activo asignado. Contactanos para coordinar tu turno.");
  }

  const startsAt = new Date(startsAtIso);
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60000);
  const boxId = professional.boxId;

  // El día del turno se deriva del instante en la zona del negocio, no del
  // slice del ISO (que está en UTC y podría caer en otro día calendario).
  const dateStr = dateStrInBusinessTz(startsAt);
  const window = await getWorkingWindow(professionalId, dateStr);
  if (!window || startsAt < window.dayStart || endsAt > window.dayEnd) {
    throw new Error("Ese profesional no trabaja en ese horario. Elegí otro día u horario.");
  }

  return prisma.$transaction(async (tx) => {
    // Re-check availability inside the transaction to close the race window
    // between "show free slots" and "write the booking" — two requests
    // landing on the same slot must not both succeed.
    const bufferedStart = new Date(startsAt.getTime() - BUFFER_MIN * 60000);
    const bufferedEnd = new Date(endsAt.getTime() + BUFFER_MIN * 60000);
    const conflicts = await tx.appointment.findMany({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: bufferedEnd },
        endsAt: { gt: bufferedStart },
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

    return tx.appointment.create({
      data: {
        tenantId: await getCurrentTenantId(),
        clientId,
        professionalId,
        serviceId,
        boxId,
        startsAt,
        endsAt,
        status,
        priceAtBooking: service.price,
        notes: notes?.trim() || null,
      },
    });
  });
}

export async function createAppointment(formData: FormData) {
  const professionalId = String(formData.get("professionalId"));
  const serviceId = String(formData.get("serviceId"));
  const startsAtIso = String(formData.get("startsAt"));
  const clientName = String(formData.get("clientName"));
  const clientPhone = String(formData.get("clientPhone"));
  const clientEmail = String(formData.get("clientEmail") || "");

  let client = await prisma.client.findFirst({ where: { phone: clientPhone } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        tenantId: await getCurrentTenantId(),
        name: clientName,
        phone: clientPhone,
        email: clientEmail || undefined,
      },
    });
  }

  const appointment = await bookAppointment({
    professionalId,
    serviceId,
    startsAtIso,
    clientId: client.id,
    status: "PENDING",
  });

  await auditPublic({
    action: "create",
    entity: "Appointment",
    entityId: appointment.id,
    clientPhone,
    changes: { professionalId, serviceId, startsAt: appointment.startsAt },
  });

  redirect(`/reserva/confirmacion/${appointment.id}`);
}

// Datos que consume el modal de reserva público (rediseño CH Estética):
// categorías con sus servicios activos + profesionales activos con box, y los
// ids de servicios que cada uno realiza (para filtrar el paso "profesional").
export async function getPublicBookingData() {
  const [categories, uncategorized, professionals] = await Promise.all([
    prisma.serviceCategory.findMany({
      orderBy: { order: "asc" },
      include: {
        services: {
          where: { active: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true, durationMin: true, price: true },
        },
      },
    }),
    prisma.service.findMany({
      where: { active: true, deletedAt: null, categoryId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, durationMin: true, price: true },
    }),
    prisma.professional.findMany({
      where: { active: true, deletedAt: null, boxId: { not: null } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        box: { select: { name: true } },
        services: { where: { active: true, deletedAt: null }, select: { id: true } },
      },
    }),
  ]);

  const groups = categories
    .filter((c) => c.services.length > 0)
    .map((c) => ({ id: c.id, name: c.name, services: c.services }));
  if (uncategorized.length > 0) {
    groups.push({ id: "otros", name: "Otros servicios", services: uncategorized });
  }

  return {
    groups,
    professionals: professionals.map((p) => ({
      id: p.id,
      name: p.name,
      boxName: p.box?.name ?? null,
      serviceIds: p.services.map((s) => s.id),
    })),
  };
}

// Novedades para la sección pública de la landing: las últimas cargadas en el
// panel (últimos 30 días), de profesionales activos. Cargar la novedad ya la
// publica acá; "Difundir" es solo el envío por WhatsApp (ver reminders-actions).
export async function getPublicNews() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return prisma.professionalNews.findMany({
    where: { createdAt: { gte: since }, professional: { active: true, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 4,
    include: { professional: { select: { name: true } } },
  });
}

// Crea el turno desde el modal y DEVUELVE el turno (no redirige, a diferencia de
// createAppointment). El modal muestra la confirmación en el paso 5.
export async function createBookingFromModal(input: {
  professionalId: string;
  serviceId: string;
  startsAtIso: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}): Promise<{ id: string; startsAt: string }> {
  const clientName = input.clientName.trim();
  const clientPhone = input.clientPhone.trim();
  if (!clientName || !clientPhone) {
    throw new Error("Nombre y teléfono son obligatorios.");
  }

  let client = await prisma.client.findFirst({ where: { phone: clientPhone } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        tenantId: await getCurrentTenantId(),
        name: clientName,
        phone: clientPhone,
        email: input.clientEmail?.trim() || undefined,
      },
    });
  }

  const appointment = await bookAppointment({
    professionalId: input.professionalId,
    serviceId: input.serviceId,
    startsAtIso: input.startsAtIso,
    clientId: client.id,
    status: "PENDING",
  });

  await auditPublic({
    action: "create",
    entity: "Appointment",
    entityId: appointment.id,
    clientPhone,
    changes: {
      professionalId: input.professionalId,
      serviceId: input.serviceId,
      startsAt: appointment.startsAt,
    },
  });

  return { id: appointment.id, startsAt: appointment.startsAt.toISOString() };
}

export async function createManualAppointment(formData: FormData) {
  const professionalId = String(formData.get("professionalId"));
  const serviceId = String(formData.get("serviceId"));
  const startsAtIso = String(formData.get("startsAt"));
  const clientName = String(formData.get("clientName"));
  const clientPhone = String(formData.get("clientPhone"));
  const statusInput = String(formData.get("status"));
  const status: BookingStatus = statusInput === "CONFIRMED" ? "CONFIRMED" : "PENDING";
  const notes = String(formData.get("notes") || "");

  if (!clientName.trim() || !clientPhone.trim()) {
    throw new Error("Nombre y teléfono del cliente son obligatorios.");
  }

  let client = await prisma.client.findFirst({ where: { phone: clientPhone } });
  if (!client) {
    client = await prisma.client.create({
      data: { tenantId: await getCurrentTenantId(), name: clientName, phone: clientPhone },
    });
  }

  const appointment = await bookAppointment({
    professionalId,
    serviceId,
    startsAtIso,
    clientId: client.id,
    status,
    notes,
  });

  await auditAdmin({
    action: "create_manual",
    entity: "Appointment",
    entityId: appointment.id,
    changes: { professionalId, serviceId, startsAt: appointment.startsAt, status },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
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

  // Cobrar el precio congelado al reservar (AMD-003); fallback al precio actual
  // del servicio solo para turnos anteriores a esta feature (priceAtBooking null).
  const amount = appointment.priceAtBooking ?? appointment.service.price;

  await prisma.payment.upsert({
    where: { appointmentId },
    create: {
      tenantId: appointment.tenantId,
      appointmentId,
      amount,
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

  await auditAdmin({
    action: "confirm_payment",
    entity: "Appointment",
    entityId: appointmentId,
    changes: { method, amount, status: "CONFIRMED" },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/reportes");
}

export async function getReportData() {
  const [payments, commissionOverrides] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "APPROVED" },
      include: {
        appointment: {
          include: { professional: true, service: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    // Overrides de comisión por (profesional, servicio) (G18).
    prisma.professionalServiceCommission.findMany(),
  ]);

  // Índice para resolver rápido: "profId:servId" -> commissionPercent override.
  const overrideMap = new Map<string, number>();
  for (const o of commissionOverrides) {
    overrideMap.set(`${o.professionalId}:${o.serviceId}`, o.commissionPercent);
  }

  const totalIngresos = payments.reduce((sum, p) => sum + p.amount, 0);

  const porDia = new Map<string, number>();
  const porProfesional = new Map<string, number>();
  const porServicio = new Map<string, number>();
  const comisionPorProfesional = new Map<string, { comision: number; ingresos: number }>();

  for (const p of payments) {
    // Agrupar por día calendario del negocio, no por día UTC.
    const day = dateStrInBusinessTz(p.appointment.startsAt);
    porDia.set(day, (porDia.get(day) ?? 0) + p.amount);

    const prof = p.appointment.professional.name;
    porProfesional.set(prof, (porProfesional.get(prof) ?? 0) + p.amount);

    const serv = p.appointment.service.name;
    porServicio.set(serv, (porServicio.get(serv) ?? 0) + p.amount);

    // La comisión solo se devenga sobre turnos efectivamente realizados
    // (COMPLETED), no sobre cualquier pago aprobado — un turno pagado pero
    // que todavía no se hizo no genera comisión.
    // El porcentaje se resuelve por (profesional, servicio): si hay override
    // usa ese; si no, cae al porcentaje general del profesional (G18).
    const pct =
      overrideMap.get(`${p.appointment.professionalId}:${p.appointment.serviceId}`) ??
      p.appointment.professional.commissionPercent;
    if (p.appointment.status === "COMPLETED" && pct > 0) {
      const current = comisionPorProfesional.get(prof) ?? { comision: 0, ingresos: 0 };
      current.ingresos += p.amount;
      current.comision += (p.amount * pct) / 100;
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
  await auditAdmin({ action: "cancel", entity: "Appointment", entityId: appointmentId });
  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
}

export async function markNoShow(formData: FormData) {
  const appointmentId = String(formData.get("appointmentId"));
  const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  if (appointment.status !== "CONFIRMED") {
    throw new Error('Solo se puede marcar "no se presentó" un turno confirmado.');
  }
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "NO_SHOW" },
  });
  await auditAdmin({ action: "no_show", entity: "Appointment", entityId: appointmentId });
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

  await auditAdmin({ action: "complete", entity: "Appointment", entityId: appointmentId });

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
  // Límites del día calendario del negocio, convertidos a UTC.
  const dayStart = businessWallTimeToUtc(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [professionals, appointments, blocksToday] = await Promise.all([
    prisma.professional.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { name: "asc" },
      include: { box: true },
    }),
    prisma.appointment.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd }, status: { not: "CANCELLED" } },
      include: { client: true, professional: true, service: true, payment: true, box: true },
      orderBy: { startsAt: "asc" },
    }),
    // Novedades (franco/vacaciones) que caen sobre este día — para mostrarlas
    // a la vista en la agenda, no solo en Catálogo (G9).
    prisma.professionalBlock.findMany({
      where: { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      include: { professional: { select: { name: true } } },
      orderBy: { professional: { name: "asc" } },
    }),
  ]);

  return { professionals, appointments, blocksToday };
}

export async function getDashboardData() {
  // "Hoy" es el día calendario del negocio, no el del servidor (UTC).
  const todayStart = businessWallTimeToUtc(todayInBusinessTz(), "00:00");
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [todayAppointments, pendingCount, weekPayments, professionalsCount, clientsCount, blocksToday] =
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
      prisma.professional.count({ where: { active: true, deletedAt: null } }),
      prisma.client.count(),
      // Novedades del día en el dashboard (ADR-011 G9): la recepción lo ve
      // apenas entra, sin ir a buscarlo a Catálogo.
      prisma.professionalBlock.findMany({
        where: { startsAt: { lt: todayEnd }, endsAt: { gt: todayStart } },
        include: { professional: { select: { name: true } } },
        orderBy: { professional: { name: "asc" } },
      }),
    ]);

  return {
    todayAppointments,
    pendingCount,
    weekRevenue: weekPayments.reduce((sum, p) => sum + p.amount, 0),
    professionalsCount,
    clientsCount,
    blocksToday,
  };
}
