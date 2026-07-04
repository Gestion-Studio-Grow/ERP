"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { BUFFER_MIN } from "@/lib/business-config";
import {
  businessWallTimeToUtc,
  todayInBusinessTz,
  dateStrInBusinessTz,
} from "@/lib/datetime";
import { auditAdmin, auditPublic } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";

export async function getProfessionalsWithServices() {
  return prisma.professional.findMany({
    where: { active: true, deletedAt: null },
    include: { services: { where: { active: true, deletedAt: null } }, box: true },
  });
}

export async function getAvailableSlots(
  professionalId: string,
  serviceId: string,
  date: string,
  // Al reprogramar un turno hay que ignorar ese mismo turno al calcular las
  // franjas libres: su horario actual (y el buffer alrededor) no debe contar
  // como ocupado contra sí mismo. Vacío en el alta normal.
  excludeAppointmentId?: string
) {
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

  // Turno a ignorar (el que se está reprogramando), si lo hay.
  const notSelf = excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {};

  const [existing, boxBlocks, professionalBlocks, resourceUsage] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...notSelf,
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
            ...notSelf,
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
  isResident,
  couponCode,
}: {
  professionalId: string;
  serviceId: string;
  startsAtIso: string;
  clientId: string;
  status: BookingStatus;
  notes?: string;
  // Vecino/a de La Alameda (ADR-013): si el servicio tiene precio preferencial
  // y el cliente contestó que sí, se congela ese precio en vez del general.
  isResident?: boolean;
  // Cupón de descuento (ADR-014) — se revalida contra la base DENTRO de la
  // transacción, nunca se confía en el descuento que mandó el cliente.
  couponCode?: string;
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
    // Re-chequea la disponibilidad DENTRO de la transacción para cerrar la
    // ventana de carrera entre "mostrar franjas libres" y "escribir la reserva":
    // dos requests sobre la misma franja no pueden triunfar las dos.
    await assertSlotAvailable(tx, { professionalId, boxId, serviceId, startsAt, endsAt });

    const appliesResidentPrice = !!isResident && service.residentPrice != null;
    const basePrice = appliesResidentPrice ? service.residentPrice! : service.price;

    // Cupón (ADR-014): se busca y consume DENTRO de esta misma transacción —
    // si dos reservas llegan a la vez con el último uso del mismo cupón, la
    // segunda que intente incrementar usedCount por encima de maxUses falla
    // acá y no cobra el descuento.
    let discountAmount = 0;
    let appliedCouponCode: string | null = null;
    const normalizedCode = couponCode?.trim().toUpperCase();
    if (normalizedCode) {
      const tenantId = await getCurrentTenantId();
      const coupon = await tx.coupon.findUnique({ where: { tenantId_code: { tenantId, code: normalizedCode } } });
      const valid =
        coupon &&
        coupon.active &&
        (!coupon.expiresAt || coupon.expiresAt >= new Date()) &&
        (coupon.maxUses == null || coupon.usedCount < coupon.maxUses);
      if (valid) {
        discountAmount =
          coupon.type === "PERCENT" ? Math.round(basePrice * (coupon.value / 100)) : Math.min(coupon.value, basePrice);
        appliedCouponCode = coupon.code;
        await tx.coupon.update({ where: { id: coupon.id }, data: { usedCount: { increment: 1 } } });
      }
      // Si el cupón ya no es válido (alguien lo agotó justo antes, venció,
      // etc.) simplemente no se aplica — no se bloquea la reserva por esto,
      // el cliente ya llegó hasta acá con la expectativa de reservar.
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
        priceAtBooking: Math.max(0, basePrice - discountAmount),
        isResidentBooking: appliesResidentPrice,
        couponCode: appliedCouponCode,
        discountAmount,
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
  const isResident = formData.get("isResident") === "on";
  const couponCode = String(formData.get("couponCode") || "").trim() || undefined;

  let client = await prisma.client.findFirst({ where: { phone: clientPhone } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        tenantId: await getCurrentTenantId(),
        name: clientName,
        phone: clientPhone,
        email: clientEmail || undefined,
        isResident,
      },
    });
  } else if (client.isResident !== isResident) {
    client = await prisma.client.update({ where: { id: client.id }, data: { isResident } });
  }

  const appointment = await bookAppointment({
    professionalId,
    serviceId,
    startsAtIso,
    clientId: client.id,
    status: "PENDING",
    isResident,
    couponCode,
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
          select: { id: true, name: true, durationMin: true, price: true, residentPrice: true, depositAmount: true },
        },
      },
    }),
    prisma.service.findMany({
      where: { active: true, deletedAt: null, categoryId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, durationMin: true, price: true, residentPrice: true, depositAmount: true },
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
  isResident?: boolean;
  couponCode?: string;
}): Promise<{ id: string; startsAt: string }> {
  const clientName = input.clientName.trim();
  const clientPhone = input.clientPhone.trim();
  const isResident = !!input.isResident;
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
        isResident,
      },
    });
  } else if (client.isResident !== isResident) {
    client = await prisma.client.update({ where: { id: client.id }, data: { isResident } });
  }

  const appointment = await bookAppointment({
    professionalId: input.professionalId,
    serviceId: input.serviceId,
    startsAtIso: input.startsAtIso,
    clientId: client.id,
    status: "PENDING",
    isResident,
    couponCode: input.couponCode,
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
  await requireCapability("agenda:manage");
  const professionalId = String(formData.get("professionalId"));
  const serviceId = String(formData.get("serviceId"));
  const startsAtIso = String(formData.get("startsAt"));
  const clientName = String(formData.get("clientName"));
  const clientPhone = String(formData.get("clientPhone"));
  const statusInput = String(formData.get("status"));
  const status: BookingStatus = statusInput === "CONFIRMED" ? "CONFIRMED" : "PENDING";
  const notes = String(formData.get("notes") || "");
  const isResident = formData.get("isResident") === "on";
  const couponCode = String(formData.get("couponCode") || "").trim() || undefined;

  if (!clientName.trim() || !clientPhone.trim()) {
    throw new Error("Nombre y teléfono del cliente son obligatorios.");
  }

  let client = await prisma.client.findFirst({ where: { phone: clientPhone } });
  if (!client) {
    client = await prisma.client.create({
      data: { tenantId: await getCurrentTenantId(), name: clientName, phone: clientPhone, isResident },
    });
  } else if (client.isResident !== isResident) {
    client = await prisma.client.update({ where: { id: client.id }, data: { isResident } });
  }

  const appointment = await bookAppointment({
    professionalId,
    serviceId,
    startsAtIso,
    clientId: client.id,
    status,
    notes,
    isResident,
    couponCode,
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

// Reprograma un turno existente a otra fecha/hora (y opcionalmente otro
// profesional) — "el cliente pidió mover su turno". Reusa la misma capacidad
// que crear/cancelar (agenda:manage: "crear/mover/cancelar turnos") y la misma
// validación de choques (assertSlotAvailable), excluyendo el propio turno para
// que no colisione consigo mismo. Conserva servicio, precio congelado, cupón,
// estado, pago y notas: solo cambia cuándo (y con quién, si aplica).
export async function rescheduleAppointment(formData: FormData) {
  await requireCapability("agenda:manage");
  const appointmentId = String(formData.get("appointmentId"));
  const startsAtIso = String(formData.get("startsAt"));
  // Profesional destino: vacío o igual → se mantiene el actual.
  const newProfessionalId = String(formData.get("professionalId") || "").trim();

  if (!appointmentId || !startsAtIso) {
    throw new Error("Faltan datos para reprogramar el turno.");
  }

  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { service: true },
  });

  // Solo turnos vivos se pueden mover; los terminales (cancelado, completado,
  // no se presentó) no.
  if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
    throw new Error("Solo se puede reprogramar un turno pendiente o confirmado.");
  }

  const targetProfessionalId = newProfessionalId || appointment.professionalId;
  const professional = await prisma.professional.findUniqueOrThrow({
    where: { id: targetProfessionalId },
    include: { box: true },
  });
  if (!professional.active || professional.deletedAt) {
    throw new Error("Ese profesional ya no está disponible.");
  }
  if (!professional.boxId || !professional.box?.active || professional.box?.deletedAt) {
    throw new Error("Ese profesional no tiene un box activo asignado.");
  }

  // La duración la fija el servicio (no cambia al reprogramar): el fin se deriva
  // del nuevo inicio. El box sigue al profesional destino.
  const startsAt = new Date(startsAtIso);
  const endsAt = new Date(startsAt.getTime() + appointment.service.durationMin * 60000);
  const boxId = professional.boxId;

  // El profesional debe trabajar en ese horario (misma regla que el alta).
  const dateStr = dateStrInBusinessTz(startsAt);
  const window = await getWorkingWindow(targetProfessionalId, dateStr);
  if (!window || startsAt < window.dayStart || endsAt > window.dayEnd) {
    throw new Error("Ese profesional no trabaja en ese horario. Elegí otro día u horario.");
  }

  await prisma.$transaction(async (tx) => {
    await assertSlotAvailable(tx, {
      professionalId: targetProfessionalId,
      boxId,
      serviceId: appointment.serviceId,
      startsAt,
      endsAt,
      excludeAppointmentId: appointmentId,
    });

    await tx.appointment.update({
      where: { id: appointmentId },
      data: { startsAt, endsAt, professionalId: targetProfessionalId, boxId },
    });
  });

  await auditAdmin({
    action: "reschedule",
    entity: "Appointment",
    entityId: appointmentId,
    changes: {
      from: {
        startsAt: appointment.startsAt,
        professionalId: appointment.professionalId,
        boxId: appointment.boxId,
      },
      to: { startsAt, professionalId: targetProfessionalId, boxId },
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
}

export async function getAppointments() {
  // Devuelve TODOS los turnos sin scoping por profesional (historial completo,
  // pantalla /admin/turnos/lista) → gestión, no lectura de agenda propia.
  await requireCapability("agenda:manage");
  return prisma.appointment.findMany({
    orderBy: { startsAt: "asc" },
    include: { client: true, professional: true, service: true, box: true, payment: true },
  });
}

export async function confirmPayment(formData: FormData) {
  await requireCapability("agenda:manage");
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
  await requireCapability("reports:read");
  // Ingresos (pagos aprobados). Las comisiones ya NO se calculan acá: viven en
  // `commission-actions.ts` (getCommissionsOverview), única fuente de verdad
  // ahora que hay liquidación con histórico — así el "pendiente de pago" y lo
  // que muestra Reportes no pueden divergir.
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

  for (const p of payments) {
    // Agrupar por día calendario del negocio, no por día UTC.
    const day = dateStrInBusinessTz(p.appointment.startsAt);
    porDia.set(day, (porDia.get(day) ?? 0) + p.amount);

    const prof = p.appointment.professional.name;
    porProfesional.set(prof, (porProfesional.get(prof) ?? 0) + p.amount);

    const serv = p.appointment.service.name;
    porServicio.set(serv, (porServicio.get(serv) ?? 0) + p.amount);
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
  };
}

export async function cancelAppointment(formData: FormData) {
  await requireCapability("agenda:manage");
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
  const user = await requireCapability("agenda:complete");
  const appointmentId = String(formData.get("appointmentId"));
  const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  // Un PROFESSIONAL solo puede operar sobre su propia agenda (ADR-017 §2.b).
  if (user.role === "PROFESSIONAL" && appointment.professionalId !== user.professionalId) {
    throw new Error("No autorizado: solo podés operar sobre tu propia agenda.");
  }
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
  const user = await requireCapability("agenda:complete");
  const appointmentId = String(formData.get("appointmentId"));

  await prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { service: { include: { products: { include: { product: true } } } } },
    });

    // Un PROFESSIONAL solo puede cerrar turnos de su propia agenda (ADR-017 §2.b).
    if (user.role === "PROFESSIONAL" && appointment.professionalId !== user.professionalId) {
      throw new Error("No autorizado: solo podés operar sobre tu propia agenda.");
    }

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
  await requireCapability("clients:read");
  return prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { appointments: { select: { id: true } } },
  });
}

export async function getClient(id: string) {
  await requireCapability("clients:read");
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
  const user = await requireCapability("agenda:read");

  // Scoping por rol (ADR-017 §2.b): el PROFESSIONAL ve SOLO su propia agenda.
  // Si por configuración quedara sin `professionalId`, se scopea a un id que no
  // existe → agenda vacía (fail-closed), nunca la de todos.
  const onlyProfessionalId =
    user.role === "PROFESSIONAL" ? user.professionalId ?? "__no_professional__" : null;

  // Límites del día calendario del negocio, convertidos a UTC.
  const dayStart = businessWallTimeToUtc(date, "00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [professionals, appointments, blocksToday] = await Promise.all([
    prisma.professional.findMany({
      where: {
        active: true,
        deletedAt: null,
        ...(onlyProfessionalId ? { id: onlyProfessionalId } : {}),
      },
      orderBy: { name: "asc" },
      include: { box: true },
    }),
    prisma.appointment.findMany({
      where: {
        startsAt: { gte: dayStart, lt: dayEnd },
        status: { not: "CANCELLED" },
        ...(onlyProfessionalId ? { professionalId: onlyProfessionalId } : {}),
      },
      include: { client: true, professional: true, service: true, payment: true, box: true },
      orderBy: { startsAt: "asc" },
    }),
    // Novedades (franco/vacaciones) que caen sobre este día — para mostrarlas
    // a la vista en la agenda, no solo en Catálogo (G9).
    prisma.professionalBlock.findMany({
      where: {
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
        ...(onlyProfessionalId ? { professionalId: onlyProfessionalId } : {}),
      },
      include: { professional: { select: { name: true } } },
      orderBy: { professional: { name: "asc" } },
    }),
  ]);

  return { professionals, appointments, blocksToday };
}

export async function getDashboardData() {
  await requireCapability("dashboard:read");
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
