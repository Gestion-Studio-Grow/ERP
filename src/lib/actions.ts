"use server";

import { cache } from "react";
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
import { cobroTurnoDetail, settleAppointmentPaymentGuarded, type SettleOutcome } from "@/lib/caja/cobro-turno";
import {
  aplicarCobroTurnoInTx,
  cobrosDelTurnoInTx,
  cobrosPorTurno,
  rastroLibroCaja,
  CobroTurnoRechazado,
  CompletarTurnoRechazado,
  type AplicarCobroResult,
} from "@/lib/turnos/cobro-turno-repo";
import {
  claveCobroTurno,
  esMetodoDePago,
  planCompletar,
  puedeCompletarse,
  type MetodoDePago,
} from "@/lib/turnos/cobros";
import { Prisma } from "@/generated/prisma/client";
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

// Resultado de una acción de mostrador que el formulario muestra en línea (los errores de
// dominio NO se lanzan: en producción Next enmascara el mensaje de un throw en Server Action).
export type ResultadoAccion = { ok: true } | { ok: false; error: string };

// Seña que se cobra EN EL MISMO ACTO de reservar (src/lib/turnos): "la seña se cobra al
// momento de reservar el turno". Va dentro de la tx de la reserva: turno + cobro + asiento
// en el libro, todo o nada.
type CobroInicial = { monto: number; method: MetodoDePago; actor: string };

async function bookAppointment({
  professionalId,
  serviceId,
  startsAtIso,
  clientId,
  clientName,
  status,
  notes,
  isResident,
  couponCode,
  cobroInicial,
}: {
  professionalId: string;
  serviceId: string;
  startsAtIso: string;
  clientId: string;
  clientName?: string;
  status: BookingStatus;
  notes?: string;
  // Vecino/a de La Alameda (ADR-013): si el servicio tiene precio preferencial
  // y el cliente contestó que sí, se congela ese precio en vez del general.
  isResident?: boolean;
  // Cupón de descuento (ADR-014) — se revalida contra la base DENTRO de la
  // transacción, nunca se confía en el descuento que mandó el cliente.
  couponCode?: string;
  cobroInicial?: CobroInicial | null;
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

  const tenantId = await getCurrentTenantId();

  const run = (withSchema: boolean) => bookingTransaction(async (tx) => {
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

    const appointment = await tx.appointment.create({
      data: {
        tenantId,
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

    // Seña al reservar: mismo acto, misma tx. Clave natural `senia:<turno>` (una sola seña
    // por turno); si la migración de cobros parciales no está aplicada, se cobra sin clave
    // persistente ni asiento (`withSchema=false`, ver settleAppointmentPaymentGuarded).
    let cobro: AplicarCobroResult | null = null;
    if (cobroInicial && cobroInicial.monto > 0) {
      cobro = await aplicarCobroTurnoInTx(tx, tenantId, {
        appointmentId: appointment.id,
        status,
        precio: appointment.priceAtBooking ?? basePrice,
        monto: cobroInicial.monto,
        method: cobroInicial.method,
        // La nota dice lo que REALMENTE pasó: desde el mostrador se cobra el servicio
        // entero, y llamarle "seña" a eso sería mentir en el dato.
        note: cobroInicial.monto >= (appointment.priceAtBooking ?? basePrice)
          ? "Cobro al reservar"
          : "Seña al reservar",
        actor: cobroInicial.actor,
        detail: cobroTurnoDetail({ serviceName: service.name, clientName: clientName ?? "" }),
        idempotencyKey: claveCobroTurno("senia", appointment.id),
        withSchema,
      });
    }
    return { appointment, cobro };
  });

  if (!cobroInicial) {
    const { appointment } = await run(false);
    return { appointment, cobro: null, libroCaja: null as ReturnType<typeof rastroLibroCaja> };
  }
  const settled = await settleAppointmentPaymentGuarded({
    runWithBridge: () => run(true),
    runWithoutBridge: () => run(false),
  });
  // La clave de la seña lleva el id del turno recién creado: no puede chocar con nadie.
  if (settled.outcome === "race") throw new Error("La reserva se envió dos veces. Revisá la agenda antes de reintentar.");
  if (settled.outcome === "degraded") {
    logger.warn("caja", "reserva con seña asentada SIN puente al libro de caja (migración de cobros parciales sin aplicar)", {
      tenantId,
      appointmentId: settled.value.appointment.id,
    });
  }
  return {
    ...settled.value,
    libroCaja: rastroLibroCaja({ outcome: settled.outcome, value: settled.value.cobro ?? undefined }),
  };
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

  // Reserva pública: la seña la cobra la recepción cuando llega el comprobante
  // ("Registrar cobro" en /admin/turnos) — no hay canal de cobro online todavía.
  const { appointment } = await bookAppointment({
    professionalId,
    serviceId,
    startsAtIso,
    clientId: client.id,
    clientName,
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
// ============================================================================
// LOS TRATAMIENTOS QUE MÁS SE ELIGEN — para la vitrina de la home.
// ============================================================================
//
// La home dejó de volcar la carta entera (eso vive en /servicios). Muestra unos
// pocos tratamientos con su PRECIO EXACTO, como hace Aesop: un tratamiento, sus
// duraciones, el precio sin "desde". Para elegir cuáles, en vez de una lista
// escrita a mano que envejece sola, se usa el dato que el propio sistema ya
// tiene: los que más se reservaron en los últimos 90 días.
//
// Es honesto ("lo más elegido" lo dice la agenda, no el marketing) y se actualiza
// solo. Sin historial — tenant nuevo, o negocio recién abierto — devuelve lista
// vacía y la home cae a los primeros de la carta: nunca queda un hueco.
//
// DEFENSIVO como su vecina de arriba: corre en la vidriera PÚBLICA, así que un
// error de schema/DB no puede tumbar la home. Falla → lista vacía.
export async function getMostBookedServiceIds(limit = 3, days = 90): Promise<string[]> {
  try {
    const desde = new Date(Date.now() - days * 86400000);
    const filas = await prisma.appointment.groupBy({
      by: ["serviceId"],
      where: {
        startsAt: { gte: desde },
        // Solo lo que efectivamente pasó o está en pie: un turno cancelado no es
        // señal de que el tratamiento guste.
        status: { in: ["COMPLETED", "CONFIRMED", "PENDING"] },
      },
      _count: { serviceId: true },
      orderBy: { _count: { serviceId: "desc" } },
      take: limit,
    });
    return filas.map((f) => f.serviceId);
  } catch {
    return [];
  }
}

// MEMOIZADA POR REQUEST (`cache` de React). La llaman el LAYOUT del sitio (para
// el modal de reserva) y la HOME (para la vitrina): sin esto, cada visita a la
// portada ejecutaba sus tres consultas DOS veces — seis viajes a la base para
// traer exactamente lo mismo. `getLocation` ya se había deduplicado así; esto
// cierra el mismo agujero en el loader más pesado del sitio público.
export const getPublicBookingData = cache(async () => {
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
});

// Novedades para la sección pública de la landing: las últimas cargadas en el
// panel (últimos 30 días), de profesionales activos. Cargar la novedad ya la
// publica acá; "Difundir" es solo el envío por WhatsApp (ver reminders-actions).
// Memoizada por request, mismo motivo que `getPublicBookingData`: la piden el
// layout (para la franja de novedades de arriba) y la home (para la sección).
export const getPublicNews = cache(async () => {
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
});

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

  const { appointment } = await bookAppointment({
    professionalId: input.professionalId,
    serviceId: input.serviceId,
    startsAtIso: input.startsAtIso,
    clientId: client.id,
    clientName,
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
  const user = await requireCapability("agenda:manage");
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

  // Seña en el acto (src/lib/turnos): la recepción marca "cobrar seña ahora", con monto
  // (precargado con el `depositAmount` del catálogo — provisional a confirmar si es fijo o
  // porcentaje) y medio. El server valida monto y medio; el saldo lo valida la tx.
  let cobroInicial: CobroInicial | null = null;
  if (formData.get("senaCobrar") === "on") {
    const monto = Number(String(formData.get("senaMonto") || "").replace(",", "."));
    const metodo = String(formData.get("senaMetodo") || "");
    if (!Number.isFinite(monto) || monto <= 0) throw new Error("El monto de la seña tiene que ser mayor a cero.");
    if (!esMetodoDePago(metodo)) throw new Error("Elegí el medio con que se cobra la seña: efectivo, Mercado Pago o transferencia.");
    cobroInicial = { monto, method: metodo, actor: `user:${user.id}` };
  }

  let client = await prisma.client.findFirst({ where: { phone: clientPhone } });
  if (!client) {
    client = await prisma.client.create({
      data: { tenantId: await getCurrentTenantId(), name: clientName, phone: clientPhone, isResident },
    });
  } else if (client.isResident !== isResident) {
    client = await prisma.client.update({ where: { id: client.id }, data: { isResident } });
  }

  let booked: Awaited<ReturnType<typeof bookAppointment>>;
  try {
    booked = await bookAppointment({
      professionalId,
      serviceId,
      startsAtIso,
      clientId: client.id,
      clientName: client.name,
      status,
      notes,
      isResident,
      couponCode,
      cobroInicial,
    });
  } catch (e) {
    // La seña excede el precio, etc.: mensaje de dominio al formulario, no un 500.
    if (e instanceof CobroTurnoRechazado) throw new Error(`No se pudo cobrar la seña: ${e.message}`);
    throw e;
  }
  const { appointment, cobro, libroCaja } = booked;

  await auditAdmin({
    action: "create_manual",
    entity: "Appointment",
    entityId: appointment.id,
    changes: {
      professionalId,
      serviceId,
      startsAt: appointment.startsAt,
      status,
      senia: cobro?.applied ? { monto: cobro.monto, method: cobroInicial?.method, saldo: cobro.estado.saldo } : null,
      libroCaja,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
  revalidatePath("/admin/caja/libro");
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
  const appointments = await prisma.appointment.findMany({
    where: { tenantId, startsAt: { gte: since } },
    orderBy: { startsAt: "asc" },
    include: { client: true, professional: true, service: true, box: true, payment: true },
  });
  return conCobros(tenantId, appointments);
}

// Adjunta a cada turno sus cobros parciales (`collections`) para que la fila muestre
// cobrado/saldo. Query aparte y tolerante: si la tabla `Collection` no está migrada, la
// agenda carga igual con `collections: []` (ver `cobrosPorTurno`).
async function conCobros<T extends { id: string }>(tenantId: string, appointments: T[]) {
  const cobros = await cobrosPorTurno(prisma, tenantId, appointments.map((a) => a.id));
  return appointments.map((a) => ({ ...a, collections: cobros.get(a.id) ?? [] }));
}

// ── Cobro de turnos (src/lib/turnos): seña al reservar, saldo al completar, parciales ──
//
// Reemplaza a `confirmPayment` (UN `Payment` por el precio completo, 1:1, sin seña ni
// parciales). Un turno puede tener VARIOS cobros (`Collection.appointmentId`, D9); el saldo
// se deriva (precio − Σ cobros); `Payment` queda como AGREGADO de los cobros para que
// Reportes, la ficha de la clienta, comisiones y facturación vean el total sin cambiar.
// Cada cobro asienta UNA VENTA en el libro de caja con su medio, por el puente existente
// (src/lib/caja/cobro-turno.ts), keyeada por el cobro (`collectionId`).

// Registra un cobro (seña, saldo o parcial) contra un turno vivo o prestado con saldo.
// NO cambia el estado del turno: reservar/confirmar/completar son pasos del ciclo de la
// dueña; la plata es otra dimensión. Idempotente por `idempotencyKey` (uuid del formulario,
// renovado tras cada cobro): el doble clic no duplica; la guarda de saldo tampoco deja
// cobrar de más.
export async function registrarCobroTurno(formData: FormData): Promise<ResultadoAccion> {
  // `agenda:collect`, no `agenda:manage`: el profesional cobra sus propios turnos (y rinde
  // la comisión después), pero no puede crear ni cancelar turnos ajenos. El scoping a su
  // `professionalId` está más abajo, dentro de la transacción.
  const user = await requireCapability("agenda:collect");
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const appointmentId = String(formData.get("appointmentId") || "");
  const monto = Number(String(formData.get("amount") || "").replace(",", "."));
  const methodRaw = String(formData.get("method") || "");
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim() || null;
  if (!appointmentId) return { ok: false, error: "Falta el turno a cobrar." };
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "El monto a cobrar tiene que ser mayor a cero." };
  if (!esMetodoDePago(methodRaw)) {
    return { ok: false, error: "Elegí el medio de pago: Mercado Pago, efectivo o transferencia." };
  }
  const method = methodRaw;
  const tenantId = await getCurrentTenantId();
  const actor = `user:${user.id}`;

  // Todo dentro de UNA tx Serializable: el estado del turno y el saldo se leen y se escriben
  // en la misma foto (dos cobros simultáneos no pueden sobre-cobrar: uno reintenta y ve el otro).
  const run = (withSchema: boolean) =>
    tenantTransaction(
      async (tx) => {
        const appointment = await tx.appointment.findUniqueOrThrow({
          where: { id: appointmentId },
          include: { service: { select: { name: true, price: true } }, client: { select: { name: true } } },
        });
        // El profesional cobra LO SUYO. Mismo scoping que `completeAppointment` y
        // `markNoShow`: la capacidad habilita la clase de acción, el dueño de la fila la
        // acota. Sin esto, `agenda:collect` dejaría cobrar el turno de cualquier colega.
        if (user.role === "PROFESSIONAL" && appointment.professionalId !== user.professionalId) {
          throw new Error("Ese turno es de otra profesional: sólo podés cobrar los tuyos.");
        }
        return aplicarCobroTurnoInTx(tx, tenantId, {
          appointmentId,
          status: appointment.status,
          precio: appointment.priceAtBooking ?? appointment.service.price,
          monto,
          method,
          actor,
          detail: cobroTurnoDetail({ serviceName: appointment.service.name, clientName: appointment.client.name }),
          idempotencyKey,
          withSchema,
        });
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  let settled: SettleOutcome<AplicarCobroResult>;
  try {
    settled = await settleAppointmentPaymentGuarded({
      runWithBridge: () => run(true),
      runWithoutBridge: () => run(false),
    });
  } catch (e) {
    if (e instanceof CobroTurnoRechazado) return { ok: false, error: e.message };
    throw e;
  }

  if (settled.outcome === "race" || !settled.value.applied) {
    // El otro submit ya dejó el cobro y su asiento. No se re-audita ni se muestra un error.
    revalidatePath("/admin/turnos");
    return { ok: true };
  }
  if (settled.outcome === "degraded") {
    logger.warn("caja", "registrarCobroTurno: cobro asentado SIN puente al libro de caja (migración de cobros parciales sin aplicar)", {
      tenantId,
      appointmentId,
    });
  }

  await auditAdmin({
    action: "collect_payment",
    entity: "Appointment",
    entityId: appointmentId,
    changes: {
      method,
      amount: settled.value.monto,
      cobrado: settled.value.estado.cobrado,
      saldo: settled.value.estado.saldo,
      libroCaja: rastroLibroCaja(settled),
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
  revalidatePath("/admin/reportes");
  revalidatePath("/admin/caja");
  revalidatePath("/admin/caja/libro");
  return { ok: true };
}

// Reservado → Confirmado (la clienta confirmó que viene). Sin plata: la seña se cobró al
// reservar (o se registra aparte). No exige seña — la recepción decide; la fila muestra
// "sin seña" para que se vea.
export async function confirmarTurno(formData: FormData) {
  await requireCapability("agenda:manage");
  if (isDemoSandbox()) return; // modo demo: no persiste
  const appointmentId = String(formData.get("appointmentId") || "");
  const res = await prisma.appointment.updateMany({
    where: { id: appointmentId, status: "PENDING" },
    data: { status: "CONFIRMED" },
  });
  if (res.count === 0) return; // ya no estaba reservado (doble clic / cambió): no hay nada que hacer
  await auditAdmin({ action: "confirm", entity: "Appointment", entityId: appointmentId, changes: { status: "CONFIRMED" } });
  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
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

// Realizado → Completado: el servicio se prestó Y se cobró el resto. Exige que el turno haya
// OCURRIDO (`startsAt <= ahora`; el QA completó un turno del martes estando domingo) y cobra
// el saldo con el medio elegido, en la MISMA tx que el cierre y el consumo de insumos. Si la
// recepción marca "dejar saldo a cobrar", el turno queda COMPLETED con saldo > 0: eso ES la
// cuenta a cobrar (derivada, no un estado nuevo del enum — decisión de producto).
export async function completeAppointment(formData: FormData): Promise<ResultadoAccion> {
  const user = await requireCapability("agenda:complete");
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const appointmentId = String(formData.get("appointmentId") || "");
  // Toggle "facturar sí/no" (ADR-024 §2.c): true por default; solo se saltea si
  // la UI manda explícitamente `facturar="false"` (checkbox "No facturar").
  const facturar = formData.get("facturar") !== "false";
  const methodRaw = String(formData.get("method") || "");
  const method: MetodoDePago | null = esMetodoDePago(methodRaw) ? methodRaw : null;
  const dejarSaldoACobrar = formData.get("saldo") === "a-cobrar";
  const tenantId = await getCurrentTenantId();
  const actor = `user:${user.id}`;

  const run = (withSchema: boolean) =>
    tenantTransaction(
      async (tx) => {
        const appointment = await tx.appointment.findUniqueOrThrow({
          where: { id: appointmentId },
          include: {
            service: { include: { products: { include: { product: true } } } },
            client: { select: { name: true } },
            payment: { select: { status: true, amount: true } },
          },
        });

        // Un PROFESSIONAL solo puede cerrar turnos de su propia agenda (ADR-017 §2.b).
        if (user.role === "PROFESSIONAL" && appointment.professionalId !== user.professionalId) {
          throw new Error("No autorizado: solo podés operar sobre tu propia agenda.");
        }

        const puede = puedeCompletarse({ status: appointment.status, startsAt: appointment.startsAt, ahora: new Date() });
        if (!puede.ok) throw new CompletarTurnoRechazado(puede.motivo);

        const precio = appointment.priceAtBooking ?? appointment.service.price;
        const cobros = await cobrosDelTurnoInTx(tx, tenantId, appointmentId);
        const plan = planCompletar({ precio, cobros, pagoLegado: appointment.payment, dejarSaldoACobrar, method });
        if (!plan.ok) throw new CompletarTurnoRechazado(plan.motivo);

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
            createdBy: actor,
            label: usage.product.name,
            allowNegative: true,
          });
        }

        // El saldo, con el medio elegido: UN cobro por lo que falta (clave natural
        // `saldo:<turno>`), en la misma tx que el cierre → asiento en el libro incluido.
        let cobro: AplicarCobroResult | null = null;
        if (plan.cobro) {
          cobro = await aplicarCobroTurnoInTx(tx, tenantId, {
            appointmentId,
            status: appointment.status,
            precio,
            monto: plan.cobro.monto,
            method: plan.cobro.method as MetodoDePago,
            note: "Saldo al completar",
            actor,
            detail: cobroTurnoDetail({ serviceName: appointment.service.name, clientName: appointment.client.name }),
            idempotencyKey: claveCobroTurno("saldo", appointmentId),
            withSchema,
          });
        }

        await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: "COMPLETED" },
        });

        return { cobro, saldoACobrar: plan.saldoACobrar };
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  let settled: SettleOutcome<{ cobro: AplicarCobroResult | null; saldoACobrar: number }>;
  try {
    settled = await settleAppointmentPaymentGuarded({
      runWithBridge: () => run(true),
      runWithoutBridge: () => run(false),
    });
  } catch (e) {
    if (e instanceof CompletarTurnoRechazado || e instanceof CobroTurnoRechazado) return { ok: false, error: e.message };
    throw e;
  }
  if (settled.outcome === "race") {
    // El otro submit ya completó y cobró. Nada que reparar.
    revalidatePath("/admin/turnos");
    return { ok: true };
  }
  if (settled.outcome === "degraded") {
    logger.warn("caja", "completeAppointment: saldo cobrado SIN puente al libro de caja (migración de cobros parciales sin aplicar)", {
      tenantId,
      appointmentId,
    });
  }
  const cobro = settled.value.cobro;

  await auditAdmin({
    action: "complete",
    entity: "Appointment",
    entityId: appointmentId,
    changes: {
      saldoCobrado: cobro?.applied ? { amount: cobro.monto, method } : null,
      saldoACobrar: settled.value.saldoACobrar,
      libroCaja: cobro ? rastroLibroCaja({ outcome: settled.outcome, value: cobro }) : null,
    },
  });

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
  revalidatePath("/admin/turnos/lista");
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/reportes");
  revalidatePath("/admin/caja");
  revalidatePath("/admin/caja/libro");
  return { ok: true };
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

  return { professionals, appointments: await conCobros(await getCurrentTenantId(), appointments), blocksToday };
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
