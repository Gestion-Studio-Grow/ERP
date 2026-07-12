"use server";

import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { BUFFER_MIN } from "@/lib/business-config";
import { DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import {
  businessWallTimeToUtc,
  todayInBusinessTz,
  dateStrInBusinessTz,
  dayOfWeekForDate,
} from "@/lib/datetime";
import { auditAdmin, auditPublic } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { bookingTransaction, tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { recordMovement } from "@/lib/stock/ledger";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";
import { generateSlotsForDays } from "@/lib/booking-slots";
import { validateBookingContact } from "@/lib/contact-validation";
import { isInvoicingEnabled } from "@/lib/fiscal";
import { facturarAppointment } from "@/lib/invoice-from-appointment";
import { computeDeepKpis, type KpiAppointment } from "@/lib/report-kpis";
import { logger } from "@/lib/logger";
import {
  isDemoSandbox,
  getDemoAgendaDay,
  getDemoReportData,
  getDemoDeepReportData,
  getDemoOwnerPanelData,
} from "@/lib/demo-sandbox";

export async function getProfessionalsWithServices() {
  return prisma.professional.findMany({
    where: { active: true, deletedAt: null },
    include: { services: { where: { active: true, deletedAt: null } }, box: true },
  });
}

// Franjas libres de UN día. Es azúcar sobre `getAvailableSlotsRange` (una sola
// fecha) para no duplicar la lógica de choques/recursos: el motor de verdad es
// el batch. Mismo resultado que antes, mismos bordes y buffer.
export async function getAvailableSlots(
  professionalId: string,
  serviceId: string,
  date: string,
  // Al reprogramar un turno hay que ignorar ese mismo turno al calcular las
  // franjas libres: su horario actual (y el buffer alrededor) no debe contar
  // como ocupado contra sí mismo. Vacío en el alta normal.
  excludeAppointmentId?: string
): Promise<string[]> {
  const byDay = await getAvailableSlotsRange(professionalId, serviceId, [date], excludeAppointmentId);
  return byDay[date] ?? [];
}

// Franjas libres de VARIOS días de una sola pasada (perf ADR-023 F-agenda).
// El calendario del funnel de reserva precalienta 14 días de golpe: hacerlo con
// `getAvailableSlots` por día disparaba ~7 queries × 14 = ~100 round-trips a Neon
// (service/professional/serviceResources se repetían idénticos cada día). Acá los
// datos compartidos se leen UNA vez y los turnos/bloqueos del RANGO completo se
// traen en una query cada uno y se reparten por día en memoria: ~7 queries totales
// para todo el rango, sin cambiar qué franjas se ofrecen. Devuelve fecha → franjas.
export async function getAvailableSlotsRange(
  professionalId: string,
  serviceId: string,
  dates: string[],
  excludeAppointmentId?: string
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  const uniqueDates = [...new Set(dates)];
  if (uniqueDates.length === 0) return result;

  // Datos compartidos por TODOS los días: no cambian de una fecha a otra, así que
  // se leen una sola vez (antes se re-leían por día). Los horarios del profesional
  // son ≤7 filas (una por día de semana) → una query cubre las 14 fechas.
  const [service, professional, workingHours, serviceResources] = await Promise.all([
    prisma.service.findUniqueOrThrow({ where: { id: serviceId } }),
    prisma.professional.findUniqueOrThrow({ where: { id: professionalId } }),
    prisma.workingHours.findMany({ where: { professionalId } }),
    prisma.serviceResource.findMany({ where: { serviceId }, include: { resource: true } }),
  ]);
  const hoursByDow = new Map(workingHours.map((h) => [h.dayOfWeek, h]));
  const resourceIds = serviceResources.map((sr) => sr.resourceId);

  // Ventana de trabajo (UTC) de cada fecha pedida; los días sin horario quedan
  // con [] y no entran al rango de búsqueda de ocupación.
  const windows = new Map<string, { dayStart: Date; dayEnd: Date }>();
  for (const date of uniqueDates) {
    result[date] = [];
    const hours = hoursByDow.get(dayOfWeekForDate(date));
    if (!hours) continue;
    windows.set(date, {
      dayStart: businessWallTimeToUtc(date, hours.startTime),
      dayEnd: businessWallTimeToUtc(date, hours.endTime),
    });
  }
  if (windows.size === 0) return result;

  // Cota global del rango: la unión de todas las ventanas. Una sola query por
  // tabla la cubre, y después se reparte por día con el MISMO predicado que
  // usaba la versión por-día (mismos bordes gte/lt y solape estricto).
  let rangeStart = Infinity;
  let rangeEnd = -Infinity;
  for (const { dayStart, dayEnd } of windows.values()) {
    rangeStart = Math.min(rangeStart, dayStart.getTime());
    rangeEnd = Math.max(rangeEnd, dayEnd.getTime());
  }
  const minStart = new Date(rangeStart);
  const maxEnd = new Date(rangeEnd);

  // Turno a ignorar (el que se está reprogramando), si lo hay.
  const notSelf = excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {};

  const [existing, boxBlocks, professionalBlocks, resourceUsage] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...notSelf,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: minStart, lt: maxEnd },
        OR: [{ professionalId }, ...(professional.boxId ? [{ boxId: professional.boxId }] : [])],
      },
      select: { startsAt: true, endsAt: true },
    }),
    professional.boxId
      ? prisma.boxBlock.findMany({
          where: { boxId: professional.boxId, startsAt: { lt: maxEnd }, endsAt: { gt: minStart } },
          select: { startsAt: true, endsAt: true },
        })
      : Promise.resolve([]),
    // Bloqueos del profesional en el rango (G9): franco / vacaciones / novedad.
    prisma.professionalBlock.findMany({
      where: { professionalId, startsAt: { lt: maxEnd }, endsAt: { gt: minStart } },
      select: { startsAt: true, endsAt: true },
    }),
    // Turnos del rango que usan alguno de los recursos que necesita este servicio,
    // con las unidades que consume cada uno (para medir ocupación por franja).
    resourceIds.length > 0
      ? prisma.appointment.findMany({
          where: {
            ...notSelf,
            status: { in: ["PENDING", "CONFIRMED"] },
            startsAt: { gte: minStart, lt: maxEnd },
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

  // Reparto por día + generación de franjas: lógica PURA y testeable (mismos
  // predicados que la versión por-día). El buffer de limpieza se aplica dentro.
  const computed = generateSlotsForDays({
    windows: [...windows].map(([date, w]) => ({ date, dayStart: w.dayStart, dayEnd: w.dayEnd })),
    durationMin: service.durationMin,
    stepMin: 30,
    bufferMin: BUFFER_MIN,
    busyAppointments: existing,
    boxBlocks,
    professionalBlocks,
    resourceUsage: resourceUsage.map((a) => ({
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      resources: a.service.resources,
    })),
    requiredResources: serviceResources.map((sr) => ({
      resourceId: sr.resourceId,
      units: sr.units,
      quantity: sr.resource.quantity,
    })),
  });

  return { ...result, ...computed };
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

  return bookingTransaction(async (tx) => {
    // Re-chequea la disponibilidad DENTRO de la transacción para cerrar la
    // ventana de carrera entre "mostrar franjas libres" y "escribir la reserva":
    // dos requests sobre la misma franja no pueden triunfar las dos. En
    // Serializable (bookingTransaction, ADR-023 F2) el re-chequeo es a prueba de
    // TOCTOU: si dos entran a la vez, una aborta y reintenta viendo la otra ya escrita.
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

  // CH-A1 · AUTORIDAD SERVER: el teléfono (canal del recordatorio) y el email —si viene— tienen
  // que ser válidos, o el turno entra pero el aviso nunca llega. No se confía en el cliente.
  const contact = validateBookingContact(clientPhone, clientEmail);
  if (!contact.ok) throw new Error(contact.error);

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
  // DEFENSIVO (incidente sitio público CH 2026-07-09): corre en el LAYOUT público → si
  // lanza, cae TODO el sitio. `select` explícito en serviceCategory (NO `include`, que
  // traería TODAS sus columnas y rompería si el schema tiene alguna que la DB del tenant
  // aún no aplicó — schema-ahead) + try/catch con fallback vacío → nunca dispara el error
  // boundary del cliente en vivo. Inerte con la DB migrada (staging idéntico). Reversible.
  try {
    const [categories, uncategorized, professionals] = await Promise.all([
      prisma.serviceCategory.findMany({
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
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
          services: { where: { active: true, deletedAt: null }, select: { id: true, name: true } },
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
        serviceNames: p.services.map((s) => s.name),
      })),
    };
  } catch (err) {
    logger.error("public-booking", "no se pudo cargar la vidriera (¿schema pre-migración?)", err);
    return {
      groups: [] as { id: string; name: string; services: { id: string; name: string; durationMin: number; price: number; residentPrice: number | null; depositAmount: number | null }[] }[],
      professionals: [] as { id: string; name: string; boxName: string | null; serviceIds: string[]; serviceNames: string[] }[],
    };
  }
}

// Novedades para la sección pública de la landing: las últimas cargadas en el
// panel (últimos 30 días), de profesionales activos. Cargar la novedad ya la
// publica acá; "Difundir" es solo el envío por WhatsApp (ver reminders-actions).
export async function getPublicNews() {
  // DEFENSIVO (corre en el layout público): ante cualquier fallo de lectura devuelve
  // vacío en vez de tumbar el sitio. Se mantiene el mismo shape (`include`) — no se cambia
  // el contrato, solo se blinda. Inerte con la DB sana.
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return await prisma.professionalNews.findMany({
      where: { createdAt: { gte: since }, professional: { active: true, deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { professional: { select: { name: true } } },
    });
  } catch (err) {
    logger.error("public-news", "no se pudieron cargar las novedades", err);
    return [];
  }
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
  // CH-A1 · AUTORIDAD SERVER (modal de reserva): teléfono con formato + email válido si viene.
  const contact = validateBookingContact(clientPhone, input.clientEmail);
  if (!contact.ok) throw new Error(contact.error);

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
  if (isDemoSandbox()) return; // modo demo: no persiste (docs/preventa/plan-acceso-sandbox-sin-password.md)
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

  await bookingTransaction(async (tx) => {
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

// Ventana por defecto del historial de turnos (días hacia atrás). Los turnos FUTUROS siempre
// entran; se acota solo el pasado para no escanear todo el histórico con 5 joins/fila.
const APPOINTMENTS_DEFAULT_RANGE_DAYS = 365;

export async function getAppointments(rangeDays: number = APPOINTMENTS_DEFAULT_RANGE_DAYS) {
  // Devuelve los turnos sin scoping por profesional (historial de gestión, /admin/turnos/lista)
  // → gestión, no lectura de agenda propia.
  await requireCapability("agenda:manage");
  // Endurecimiento defensivo: (1) filtro `tenantId` EXPLÍCITO además de RLS (enciende el índice
  // por tenant); (2) COTA DE RANGO — antes traía TODO el histórico con 5 joins por fila; ahora se
  // acota al último año + todo el futuro (parametrizable), que es lo que la pantalla realmente usa.
  const tenantId = await getCurrentTenantId();
  const since = new Date(Date.now() - Math.max(1, rangeDays) * 24 * 60 * 60 * 1000);
  return prisma.appointment.findMany({
    where: { tenantId, startsAt: { gte: since } },
    orderBy: { startsAt: "asc" },
    include: { client: true, professional: true, service: true, box: true, payment: true },
  });
}

export async function confirmPayment(formData: FormData) {
  await requireCapability("agenda:manage");
  if (isDemoSandbox()) return; // modo demo: no persiste
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

export async function getReportData(rangeDays: number = DEFAULT_REPORT_RANGE_DAYS) {
  await requireCapability("reports:read");
  if (isDemoSandbox()) return getDemoReportData(rangeDays);
  const tenantId = await getCurrentTenantId();
  // Ingresos (pagos aprobados). Las comisiones ya NO se calculan acá: viven en
  // `commission-actions.ts` (getCommissionsOverview), única fuente de verdad
  // ahora que hay liquidación con histórico — así el "pendiente de pago" y lo
  // que muestra Reportes no pueden divergir.
  //
  // ADR-023 F3: antes esta query traía TODO el histórico de pagos sin filtro de fecha
  // ni `tenantId` y agregaba en JS — O(todo lo que existió), degradaba al crecer. Ahora
  // el rango es OBLIGATORIO (default 90 días) y se filtra por tenant; además usa `select`
  // acotado (no `include` completo) para no traer columnas de más. Las agregaciones
  // por día/profesional/servicio siguen en app porque dependen de lógica que `groupBy`
  // de Prisma no expresa en una pasada (día calendario en zona del negocio y nombres de
  // relaciones anidadas) — pero ahora corren sobre un set acotado por el rango, no sobre
  // toda la historia. Ver enmienda ADR-023 F3.
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  const payments = await prisma.payment.findMany({
    where: { tenantId, status: "APPROVED", createdAt: { gte: desde, lte: hasta } },
    select: {
      amount: true,
      appointment: {
        select: {
          startsAt: true,
          professional: { select: { name: true } },
          service: { select: { name: true } },
        },
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
    rangeDays,
    desde,
    hasta,
    totalIngresos,
    cantidadPagos: payments.length,
    porDia: Array.from(porDia.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => (a.label < b.label ? 1 : -1)),
    porProfesional: toSortedArray(porProfesional),
    porServicio: toSortedArray(porServicio),
  };
}

// Reportes v2 (frente ejecutivo): KPIs profundos para el dueño — fuga operativa
// (no-show/cancelación), ticket promedio, mix de método de pago, retención y
// rentabilidad hora-silla. Complementa a `getReportData` (facturación bruta) sin
// tocarlo. Una sola query de turnos acotada por tenant + rango (índice
// `[tenantId, startsAt]`); la agregación vive en `report-kpis.ts` (lógica pura,
// testeada). Read-only y range-bounded — sano para el plan free de Neon.
export async function getDeepReportData(rangeDays: number = DEFAULT_REPORT_RANGE_DAYS) {
  await requireCapability("reports:read");
  if (isDemoSandbox()) return getDemoDeepReportData(rangeDays);
  const tenantId = await getCurrentTenantId();

  const hasta = new Date();
  const desde = new Date(hasta.getTime() - rangeDays * 24 * 60 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: { tenantId, startsAt: { gte: desde, lte: hasta } },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      clientId: true,
      professional: { select: { name: true } },
      // Solo el pago aprobado cuenta como ingreso (mismo criterio que getReportData).
      payment: { select: { amount: true, method: true, status: true } },
    },
  });

  const mapped: KpiAppointment[] = appointments.map((a) => ({
    status: a.status,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    clientId: a.clientId,
    professionalName: a.professional.name,
    payment:
      a.payment && a.payment.status === "APPROVED"
        ? { amount: a.payment.amount, method: a.payment.method }
        : null,
  }));

  return {
    rangeDays,
    desde,
    hasta,
    totalTurnos: mapped.length,
    kpis: computeDeepKpis(mapped),
  };
}

// Panel del Dueño (AGENCIA GROW — herramienta de gestión de negocios propios, no
// satélite del ERP). Reúne el dato para la lectura de negocio en lenguaje llano:
//   · insights del período (actual vs. período previo de igual largo) → owner-insights
//   · tendencias mensuales multi-período (últimos meses COMPLETOS) → owner-trends
// Single-tenant (RLS normal, no cruza a nadie: eso es ADR-027, Agencia Digital). Una
// sola query range-bounded sobre una ventana ancha que se rebana en memoria — no
// golpea Neon más de una vez y respeta el plan free. La narrativa/tendencia se computa
// en la página (funciones puras owner-insights/owner-trends), acá solo el dato.
export async function getOwnerPanelData(rangeDays: number = DEFAULT_REPORT_RANGE_DAYS) {
  await requireCapability("reports:read");
  if (isDemoSandbox()) return getDemoOwnerPanelData(rangeDays);
  const tenantId = await getCurrentTenantId();

  const DAY_MS = 24 * 60 * 60 * 1000;
  const TREND_MONTHS = 6; // meses completos objetivo para la serie de tendencia
  const hasta = new Date();

  // Ventana ancha: la que abarque lo más viejo entre (a) el período previo para el
  // delta de insights [now - 2*range] y (b) el inicio del bloque de tendencia
  // [primer día del mes, TREND_MONTHS atrás]. Una query cubre ambos usos.
  const trendStart = new Date(hasta.getFullYear(), hasta.getMonth() - TREND_MONTHS, 1);
  const prevStart = new Date(hasta.getTime() - 2 * rangeDays * DAY_MS);
  const desde = trendStart < prevStart ? trendStart : prevStart;

  const appointments = await prisma.appointment.findMany({
    where: { tenantId, startsAt: { gte: desde, lte: hasta } },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      clientId: true,
      professional: { select: { name: true } },
      payment: { select: { amount: true, method: true, status: true } },
    },
  });

  const mapped: KpiAppointment[] = appointments.map((a) => ({
    status: a.status,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    clientId: a.clientId,
    professionalName: a.professional.name,
    payment:
      a.payment && a.payment.status === "APPROVED"
        ? { amount: a.payment.amount, method: a.payment.method }
        : null,
  }));

  // Insights: período actual vs. el previo de igual largo (comparación contra vos
  // mismo — no requiere ADR-027 ni otros tenants).
  const curStart = new Date(hasta.getTime() - rangeDays * DAY_MS);
  const current = computeDeepKpis(mapped.filter((a) => a.startsAt >= curStart));
  const prevList = mapped.filter((a) => a.startsAt >= prevStart && a.startsAt < curStart);
  const previous = prevList.length > 0 ? computeDeepKpis(prevList) : null;

  // Tendencias: buckets por mes calendario (zona del negocio). Se EXCLUYE el mes en
  // curso (parcial): sus KPIs incompletos distorsionarían la tendencia. Se toman los
  // últimos TREND_MONTHS meses completos con dato.
  const currentMonth = dateStrInBusinessTz(hasta).slice(0, 7);
  const byMonth = new Map<string, KpiAppointment[]>();
  for (const a of mapped) {
    const mk = dateStrInBusinessTz(a.startsAt).slice(0, 7);
    if (mk === currentMonth) continue;
    const arr = byMonth.get(mk) ?? [];
    arr.push(a);
    byMonth.set(mk, arr);
  }
  const months = Array.from(byMonth.keys())
    .sort()
    .slice(-TREND_MONTHS)
    .map((month) => ({ month, kpis: computeDeepKpis(byMonth.get(month)!) }));

  return {
    rangeDays,
    desde,
    hasta,
    hasPrevious: previous !== null,
    current,
    previous,
    months,
  };
}

export async function cancelAppointment(formData: FormData) {
  await requireCapability("agenda:manage");
  if (isDemoSandbox()) return; // modo demo: no persiste
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
  if (isDemoSandbox()) return; // modo demo: no persiste
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
  if (isDemoSandbox()) return; // modo demo: no persiste
  const appointmentId = String(formData.get("appointmentId"));
  // Toggle "facturar sí/no" (ADR-024 §2.c): true por default; solo se saltea si
  // la UI manda explícitamente `facturar="false"` (checkbox "No facturar").
  const facturar = formData.get("facturar") !== "false";

  const tenantId = await tenantTransaction(async (tx) => {
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

    // Consumo de insumos al cerrar el turno, vía ledger (`recordMovement`): descuenta
    // el stock y asienta un StockMovement (CONSUMO) por insumo en la misma transacción.
    // `allowNegative`: el cierre del turno NO se bloquea por falta de insumo cargado
    // (a diferencia de la venta) — el servicio ya se prestó; que el stock quede en
    // rojo es una señal para reponer/ajustar, no un motivo para frenar el cierre.
    for (const usage of appointment.service.products) {
      await recordMovement(tx, {
        tenantId: appointment.tenantId,
        productId: usage.productId,
        type: "CONSUMO",
        qty: usage.quantity,
        appointmentId,
        createdBy: `user:${user.id}`,
        label: usage.product.name,
        allowNegative: true,
      });
    }

    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "COMPLETED" },
    });

    return appointment.tenantId;
  });

  await auditAdmin({ action: "complete", entity: "Appointment", entityId: appointmentId });

  // Disparo de facturación al cerrar el servicio (ADR-024 §2.a). Best-effort y
  // detrás del flag maestro (§2.b): si el flag está OFF o el operador eligió no
  // facturar, no pasa nada; si falla, el turno igual quedó COMPLETED. Nunca
  // rompe el cierre de la recepción.
  if (facturar && isInvoicingEnabled()) {
    try {
      await facturarAppointment(appointmentId, tenantId);
    } catch (err) {
      logger.error("arca", "facturación best-effort falló", err, { appointmentId, tenantId });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/reportes");
}

export async function getClients() {
  await requireCapability("clients:read");
  // Solo se necesita la CANTIDAD de turnos por cliente (badge en la lista), no las
  // filas. `_count` lo resuelve en la DB con un COUNT agrupado en vez de traer todos
  // los `appointments` de todos los clientes a memoria y contar en JS (ADR-023 F5).
  return prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { appointments: true } } },
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
  if (isDemoSandbox()) return getDemoAgendaDay(date);

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

// Home de MOSTRADOR/retail (Wave B): ventas del día, ingresos, stock bajo, caja abierta.
// Gemelo de `getDashboardData` para tenants de rubro con POS (carnicería/velas/pádel/…).
// La pantalla elige cuál usar según `dashboardModeForModules` (por módulos activos →
// reversible por `MODULE_REGISTRY_ENABLED`). Read-only, sin schema nuevo.
export async function getRetailDashboardData() {
  await requireCapability("dashboard:read");
  const todayStart = businessWallTimeToUtc(todayInBusinessTz(), "00:00");
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [todayOrders, weekOrders, products, clientsCount, openCash] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: todayStart, lt: todayEnd }, status: { not: "CANCELLED" } },
      select: { total: true },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: weekStart }, status: { not: "CANCELLED" } },
      select: { total: true },
    }),
    prisma.product.findMany({
      where: { active: true, deletedAt: null, trackStock: true },
      select: { id: true, name: true, unit: true, stock: true, lowStockAt: true },
    }),
    prisma.client.count(),
    prisma.cashSession.findFirst({ where: { status: "OPEN" }, select: { id: true } }),
  ]);

  const lowStock = products
    .filter((p) => p.stock <= p.lowStockAt)
    .sort((a, b) => a.stock - b.stock);

  return {
    todaySalesCount: todayOrders.length,
    todayRevenue: todayOrders.reduce((s, o) => s + o.total, 0),
    weekRevenue: weekOrders.reduce((s, o) => s + o.total, 0),
    lowStock, // { id, name, unit, stock, lowStockAt }[]
    lowStockCount: lowStock.length,
    clientsCount,
    cashOpen: !!openCash,
  };
}
