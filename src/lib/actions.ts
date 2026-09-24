"use server";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { BUFFER_MIN } from "@/lib/business-config";
import { DEFAULT_REPORT_RANGE_DAYS } from "@/lib/report-config";
import {
  businessWallTimeToUtc,
  todayInBusinessTz,
  dateStrInBusinessTz,
  dayOfWeekForDate,
} from "@/lib/datetime";
import { auditAdmin, auditPublic } from "@/lib/audit-core";
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
import { RechazoDeDominio, rechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { cobroTurnoDetail, settleAppointmentPaymentGuarded, type SettleOutcome } from "@/lib/caja/cobro-turno";
import {
  aplicarCobroTurnoInTx,
  cobrosDelTurnoInTx,
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
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";
import { agruparIngresos, bordesDelPeriodo } from "@/lib/report-ingresos";
import {
  anularCobroTurnoInTx,
  condonarSaldoTurnoInTx,
  cobrosDetalladosPorTurno,
  validarMotivo,
  mensajeMotivoInvalido,
  AnulacionRechazada,
  CondonacionRechazada,
  type AnularCobroResult,
  type CondonarSaldoResult,
} from "@/lib/turnos/anulacion";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay, type DayKey } from "@/lib/caja/cierre-diario";
import { isColumnMissing } from "@/lib/prisma-errors";
import {
  buscarFichaPorTelefono,
  entradaAuditoriaEmpate,
  resumirFichasParaAlta,
  type FichaEncontrada,
  type FichaParaAlta,
} from "@/lib/clientes/ficha-por-telefono";
import { diaSiguiente, rangoDelDia, textoRecordatorio } from "@/lib/turnos/turno-abierto";
import { cancelarTurnoVivo, whereTurnosDeManana, whereTurnosDelDia } from "@/lib/crm/wheres";
import { Prisma } from "@/generated/prisma/client";
import {
  isDemoSandbox,
  getDemoAgendaDay,
  getDemoReportData,
  getDemoDeepReportData,
  getDemoOwnerPanelData,
} from "@/lib/demo-sandbox";

export async function getProfessionalsWithServices() {
  const args = {
    where: { active: true, deletedAt: null },
    include: { services: { where: { active: true, deletedAt: null } }, box: true },
  } as const;
  try {
    return await prisma.professional.findMany(args);
  } catch (err) {
    // Schema-ahead: si `cobraEnMostrador` todavía no existe en la base, el `include` de
    // arriba falla al materializar la fila. Antes que dejar el mostrador SIN profesionales
    // —o sea, sin poder cobrar un servicio— se devuelven sin el flag, y la regla lo trata
    // como el default de la columna (`true`, el mostrador cobra).
    if (!isColumnMissing(err, "cobraEnMostrador")) throw err;
    const filas = await prisma.professional.findMany({
      where: args.where,
      select: {
        id: true, name: true, email: true, phone: true, active: true, boxId: true,
        commissionPercent: true, tenantId: true, createdAt: true, updatedAt: true, deletedAt: true,
        services: { where: { active: true, deletedAt: null } },
        box: true,
      },
    });
    return filas as unknown as Awaited<ReturnType<typeof prisma.professional.findMany<typeof args>>>;
  }
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

    // ADR-013: UNA sola enunciación de la regla, compartida con la lista de espera. No se
    // reescribe acá — cuando estuvo escrita dos veces, la otra copia se quedó atrás.
    const { priceAtBooking: basePrice, isResidentBooking: appliesResidentPrice } =
      precioCongeladoDeReserva(service, isResident);

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

// ── La ficha de una reserva PÚBLICA (vidriera y modal) ──────────────────────
//
// La encuentra por teléfono NORMALIZADO (`buscarFichaPorTelefono`): "11 4000-7919" y
// "1140007919" ya no son dos clientas. Y justamente porque ahora la coincidencia es más
// ancha, este camino —que lo usa un ANÓNIMO— queda de sólo lectura sobre la ficha existente:
//   - NO le cambia `isResident`. Antes lo pisaba con lo que tildara el visitante. Ese dato de
//     la ficha fija precio en dos lugares: la lista de espera congela con `client.isResident`
//     (`bookFromWaitlist`), y el alta de la recepción precarga "de la zona" desde la ficha
//     (`alCambiarTelefono`). Cualquiera que supiera el teléfono de una clienta podía sacarle o
//     darle el beneficio. El precio de ESTA reserva sigue saliendo de lo tildado, como
//     siempre: queda Reservada y la recepción la ve antes de confirmar.
//   - Esta función devuelve el id (y el empate, para auditarlo) y nada de eso sale de este
//     archivo hacia el visitante. OJO, igual: el turno queda colgado de la ficha encontrada,
//     y las páginas públicas del turno (/reserva/confirmacion/[id] y /reserva/turno/[id])
//     muestran `appointment.client.name`. Con la coincidencia ancha, un anónimo que tipee el
//     número de una clienta en cualquier formato ve el NOMBRE de ella ahí. Esas páginas
//     tienen que dejar de leer la ficha; el test que lo vigila está en
//     ficha-por-telefono.test.ts.
// NO exportada a propósito: en un archivo "use server" cada export es un endpoint.
async function fichaDeReservaPublica(datos: {
  name: string;
  phone: string;
  email?: string;
  isResident: boolean;
}): Promise<FichaEncontrada> {
  const tenantId = await getCurrentTenantId();
  const encontrada = await buscarFichaPorTelefono(prisma, tenantId, datos.phone);
  // El empate (si lo hay) vuelve al llamador, que lo audita recién con el turno reservado.
  if (encontrada) return encontrada;
  const creada = await prisma.client.create({
    data: { tenantId, name: datos.name, phone: datos.phone, email: datos.email, isResident: datos.isResident },
    select: { id: true },
  });
  return { id: creada.id, empate: null };
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

  const ficha = await fichaDeReservaPublica({
    name: clientName,
    phone: clientPhone,
    email: clientEmail || undefined,
    isResident,
  });
  const clientId = ficha.id;

  // Reserva pública: la seña la cobra la recepción cuando llega el comprobante
  // ("Registrar cobro" en /admin/turnos) — no hay canal de cobro online todavía.
  const { appointment } = await bookAppointment({
    professionalId,
    serviceId,
    startsAtIso,
    clientId,
    clientName,
    status: "PENDING",
    isResident,
    couponCode,
  });

  if (ficha.empate) await auditPublic({ ...entradaAuditoriaEmpate(ficha.empate), clientPhone });
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

  const ficha = await fichaDeReservaPublica({
    name: clientName,
    phone: clientPhone,
    email: input.clientEmail?.trim() || undefined,
    isResident,
  });
  const clientId = ficha.id;

  const { appointment } = await bookAppointment({
    professionalId: input.professionalId,
    serviceId: input.serviceId,
    startsAtIso: input.startsAtIso,
    clientId,
    clientName,
    status: "PENDING",
    isResident,
    couponCode: input.couponCode,
  });

  if (ficha.empate) await auditPublic({ ...entradaAuditoriaEmpate(ficha.empate), clientPhone });
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

/**
 * ¿Este error de `bookAppointment` es una respuesta al usuario o un bug nuestro?
 *
 * `bookAppointment` valida reglas de negocio tirando `Error` con mensaje en castellano
 * (horario ocupado, box sin capacidad, servicio inactivo, cupón inválido). No hay una clase
 * propia para distinguirlos de un `TypeError`, y crearla obligaría a tocar todos los
 * llamadores. Mientras tanto se clasifican por forma: un mensaje en castellano dirigido a
 * una persona ES la respuesta; cualquier otra cosa sube.
 *
 * Es una heurística y está dicho: si un error de programación trae una de estas palabras,
 * se va a mostrar como si fuera de dominio. El costo de equivocarse para ese lado es un
 * mensaje raro; para el otro lado es "Minified React error #441" en la pantalla de cobro.
 */
function esErrorDeDominioAlReservar(e: Error): boolean {
  const m = e.message;
  if (!m || m.length > 300) return false;
  return /horario|ocupad|disponib|libre|box|capacidad|servicio|profesional|cupón|cupon|turno|agenda|precio|seña|sena/i.test(m);
}

export async function createManualAppointment(formData: FormData): Promise<ResultadoAccion> {
  // DEVUELVE un resultado en vez de tirar. En producción, un `throw` dentro de una Server
  // Action no llega con su mensaje: Next lo reemplaza por un digest y el formulario muestra
  // "Minified React error #441". Quien lee eso es la recepcionista, con la clienta enfrente,
  // en la pantalla donde se cobra la seña — y el mensaje real ("ese horario ya no está
  // libre", "la seña excede el precio") era exactamente lo que necesitaba para resolverlo.
  //
  // Lo que sí sigue tirando: los errores de PROGRAMACIÓN. Un `throw` que no previmos tiene
  // que llegar al log del servidor, no convertirse en un cartelito. Por eso el catch de
  // abajo es por tipo, no un catch-all.
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
    return { ok: false, error: "Nombre y teléfono del cliente son obligatorios." };
  }

  // Seña en el acto (src/lib/turnos): la recepción marca "cobrar seña ahora", con monto
  // (precargado con el `depositAmount` del catálogo — provisional a confirmar si es fijo o
  // porcentaje) y medio. El server valida monto y medio; el saldo lo valida la tx.
  let cobroInicial: CobroInicial | null = null;
  if (formData.get("senaCobrar") === "on") {
    const monto = Number(String(formData.get("senaMonto") || "").replace(",", "."));
    const metodo = String(formData.get("senaMetodo") || "");
    if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "El monto de la seña tiene que ser mayor a cero." };
    if (!esMetodoDePago(metodo)) return { ok: false, error: "Elegí el medio con que se cobra la seña: efectivo, Mercado Pago o transferencia." };
    // MISMA REGLA QUE EL COBRO SUELTO, y hace falta acá aparte: el mostrador da de alta el
    // turno Y lo cobra en un solo submit. Sin esta guarda, apagar el bloque de cobro en la
    // pantalla sería toda la protección que hay — o sea, ninguna del lado del servidor.
    // Dar el turno se permite igual; lo único que se rechaza es tomarle la plata.
    const dueño = await leerProfesionalParaCobro(professionalId);
    const veredicto = puedeCobrarEsteTurno({
      rol: user.role,
      professionalIdDelUsuario: user.professionalId,
      professionalIdDelTurno: professionalId,
      nombreProfesional: dueño.nombre,
      cobraEnMostrador: dueño.cobraEnMostrador,
    });
    if (!veredicto.ok) return { ok: false, error: veredicto.motivo };
    cobroInicial = { monto, method: metodo, actor: `user:${user.id}` };
  }

  // La ficha por teléfono NORMALIZADO: "1140007919" encuentra a la clienta cargada como
  // "11 4000-7919" en vez de crearle una segunda ficha. Es lo mismo que el formulario le
  // mostró a la recepción al tipear el teléfono (`fichaParaTelefono`, misma elección).
  // Acá, a diferencia de la reserva pública, la ficha SÍ se actualiza con "cliente de la
  // zona": lo marca la recepción, con sesión y auditoría, como siempre.
  const tenantId = await getCurrentTenantId();
  const encontrada = await buscarFichaPorTelefono(prisma, tenantId, clientPhone);
  let client = encontrada
    ? await prisma.client.findFirst({ where: { id: encontrada.id, tenantId } })
    : null;
  if (!client) {
    client = await prisma.client.create({
      data: { tenantId, name: clientName, phone: clientPhone, isResident },
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
    // La seña excede el precio, el horario se ocupó entre que se eligió y se envió, el cupón
    // no existe: son respuestas de DOMINIO y van al formulario con su texto.
    if (e instanceof CobroTurnoRechazado) return { ok: false, error: `No se pudo cobrar la seña: ${e.message}` };
    if (e instanceof Error && esErrorDeDominioAlReservar(e)) return { ok: false, error: e.message };
    // Cualquier otra cosa es un bug: que llegue al log del servidor, no a un cartelito.
    throw e;
  }
  const { appointment, cobro, libroCaja } = booked;

  // El empate de fichas se registra recién con el turno reservado: si la reserva se rechaza
  // (horario ocupado, seña que excede), no queda una fila de auditoría de un alta que no pasó.
  if (encontrada?.empate) await auditAdmin(entradaAuditoriaEmpate(encontrada.empate));
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
  return { ok: true };
}

// Reprograma un turno existente a otra fecha/hora (y opcionalmente otro
// profesional) — "el cliente pidió mover su turno". Reusa la misma capacidad
// que crear/cancelar (agenda:manage: "crear/mover/cancelar turnos") y la misma
// validación de choques (assertSlotAvailable), excluyendo el propio turno para
// que no colisione consigo mismo. Conserva servicio, precio congelado, cupón,
// estado, pago y notas: solo cambia cuándo (y con quién, si aplica).
// Devuelve el rechazo ({ ok: false, error }) en vez de tirarlo: tirado, en producción Next lo
// tapaba con un texto en inglés y la recepción no sabía por qué no se movió el turno. El
// redirect de la guardia (sin sesión o sin permiso) sigue su camino.
export async function rescheduleAppointment(formData: FormData): Promise<ResultadoAccion> {
  await requireCapability("agenda:manage");
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste (docs/preventa/plan-acceso-sandbox-sin-password.md)
  try {
    await reprogramarTurno(formData);
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return {
      ok: false,
      // Un horario ocupado, un profesional sin box: rechazos de DOMINIO, se muestran con su
      // motivo. Una caída de la base o un bug no se muestran crudos: el genérico, y el detalle
      // al log del servidor.
      error: rechazoDeDominio(
        e,
        "No se pudo reprogramar el turno. Probá de nuevo; si sigue, avisá a GSG.",
        "agenda.reprogramar",
      ),
    };
  }
}

/** El cuerpo de la reprogramación: TIRA los rechazos de dominio (los atrapa la action). */
async function reprogramarTurno(formData: FormData): Promise<void> {
  const tenantId = await getCurrentTenantId();
  const appointmentId = String(formData.get("appointmentId"));
  const startsAtIso = String(formData.get("startsAt"));
  // Profesional destino: vacío o igual → se mantiene el actual.
  const newProfessionalId = String(formData.get("professionalId") || "").trim();

  if (!appointmentId || !startsAtIso) {
    throw new RechazoDeDominio("Faltan datos para reprogramar el turno.");
  }

  // El id viene del navegador: el negocio va escrito a mano además de RLS.
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    include: { service: true },
  });
  if (!appointment) throw new RechazoDeDominio("Ese turno ya no existe. Recargá la agenda.");

  // Solo turnos vivos se pueden mover; los terminales (cancelado, completado,
  // no se presentó) no.
  if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
    throw new RechazoDeDominio("Solo se puede reprogramar un turno pendiente o confirmado.");
  }

  const targetProfessionalId = newProfessionalId || appointment.professionalId;
  const professional = await prisma.professional.findFirst({
    where: { id: targetProfessionalId, tenantId },
    include: { box: true },
  });
  if (!professional || !professional.active || professional.deletedAt) {
    throw new RechazoDeDominio("Ese profesional ya no está disponible.");
  }
  if (!professional.boxId || !professional.box?.active || professional.box?.deletedAt) {
    throw new RechazoDeDominio("Ese profesional no tiene un box activo asignado.");
  }

  // La duración la fija el servicio (no cambia al reprogramar): el fin se deriva
  // del nuevo inicio. El box sigue al profesional destino.
  const startsAt = new Date(startsAtIso);
  // Una fecha que no se puede leer haría tirar un RangeError más abajo (y se vería el genérico):
  // es un dato del formulario, así que se dice qué corregir.
  if (Number.isNaN(startsAt.getTime())) {
    throw new RechazoDeDominio("Ese horario no se pudo leer. Elegí de nuevo el día y la hora.");
  }
  const endsAt = new Date(startsAt.getTime() + appointment.service.durationMin * 60000);
  const boxId = professional.boxId;

  // El profesional debe trabajar en ese horario (misma regla que el alta).
  const dateStr = dateStrInBusinessTz(startsAt);
  const window = await getWorkingWindow(targetProfessionalId, dateStr);
  if (!window || startsAt < window.dayStart || endsAt > window.dayEnd) {
    throw new RechazoDeDominio("Ese profesional no trabaja en ese horario. Elegí otro día u horario.");
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

    // `reminderSentAt` vuelve a null: el aviso que se dio (a mano desde "Mañana: confirmar"
    // o por el barrido) era para la fecha VIEJA. Sin esto, el turno movido aparecía como
    // "avisada HH:MM" en la fecha nueva sin que nadie le hubiera avisado de esa fecha.
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { startsAt, endsAt, professionalId: targetProfessionalId, boxId, reminderSentAt: null },
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
// agenda carga igual con `collections: []` (ver `cobrosDetalladosPorTurno`).
//
// Trae `id` y `note` —no sólo monto y medio, como hacía `cobrosPorTurno`— porque sin el id
// no hay qué anular: el botón "Anular este cobro" apunta a UNA fila `Collection`, y la nota
// es lo que distingue un cobro de su contrapartida y de una condonación (anulacion.ts).
async function conCobros<T extends { id: string }>(tenantId: string, appointments: T[]) {
  const cobros = await cobrosDetalladosPorTurno(prisma, tenantId, appointments.map((a) => a.id));
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
/**
 * El flag de cobro de UNA profesional, por id. Hermano de `leerProfesionalDelTurno`, para el
 * alta del mostrador (que todavía no tiene un turno del que colgarse). Misma tolerancia al
 * schema-ahead: si la columna no está, el flag vuelve `undefined` y rige el default.
 */
async function leerProfesionalParaCobro(professionalId: string): Promise<{
  nombre: string | null;
  cobraEnMostrador?: boolean;
}> {
  try {
    const p = await prisma.professional.findUnique({
      where: { id: professionalId },
      select: { name: true, cobraEnMostrador: true },
    });
    return { nombre: p?.name ?? null, cobraEnMostrador: p?.cobraEnMostrador };
  } catch (err) {
    if (!isColumnMissing(err, "cobraEnMostrador")) throw err;
    const p = await prisma.professional.findUnique({ where: { id: professionalId }, select: { name: true } });
    return { nombre: p?.name ?? null };
  }
}

/**
 * La profesional del turno y su flag de cobro, tolerando que la columna no exista todavía.
 *
 * `prisma` (no `tx`) porque esto es un permiso que se evalúa antes de la transacción. El
 * catch de P2022 es el puente de schema-ahead: mientras
 * `20260911120000_profesional_cobra_en_mostrador` no esté aplicada en Neon, se devuelve el
 * flag en `undefined` y la regla lo trata como el default de la columna (`true`). El cobro
 * sigue funcionando; lo único que no rige todavía es la excepción.
 */
async function leerProfesionalDelTurno(appointmentId: string): Promise<{
  professionalId: string;
  nombre: string | null;
  cobraEnMostrador?: boolean;
}> {
  try {
    const a = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { professionalId: true, professional: { select: { name: true, cobraEnMostrador: true } } },
    });
    return {
      professionalId: a.professionalId,
      nombre: a.professional?.name ?? null,
      cobraEnMostrador: a.professional?.cobraEnMostrador,
    };
  } catch (err) {
    if (!isColumnMissing(err, "cobraEnMostrador")) throw err;
    const a = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { professionalId: true, professional: { select: { name: true } } },
    });
    return { professionalId: a.professionalId, nombre: a.professional?.name ?? null };
  }
}

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

  // ── QUIÉN PUEDE COBRAR ESTE TURNO ──────────────────────────────────────────
  //
  // Se resuelve ANTES de abrir la transacción, y a propósito: es un permiso, no un dato
  // transaccional. Fallar acá no escribe nada y le devuelve a la recepcionista una frase
  // que le dice qué hacer, en vez de abortar una tx a mitad de camino.
  //
  // `cobraEnMostrador` es configuración que cambia una vez por año; leerla un instante
  // antes del cobro no abre ninguna carrera que importe. Y se lee tolerando que la columna
  // todavía no exista (migración sin aplicar): un flag ausente NO puede frenar un cobro —
  // sería una caja que deja de funcionar por un deploy.
  const delTurno = await leerProfesionalDelTurno(appointmentId);
  const veredicto = puedeCobrarEsteTurno({
    rol: user.role,
    professionalIdDelUsuario: user.professionalId,
    professionalIdDelTurno: delTurno.professionalId,
    nombreProfesional: delTurno.nombre,
    cobraEnMostrador: delTurno.cobraEnMostrador,
  });
  if (!veredicto.ok) return { ok: false, error: veredicto.motivo };

  // Todo dentro de UNA tx Serializable: el estado del turno y el saldo se leen y se escriben
  // en la misma foto (dos cobros simultáneos no pueden sobre-cobrar: uno reintenta y ve el otro).
  const run = (withSchema: boolean) =>
    tenantTransaction(
      async (tx) => {
        const appointment = await tx.appointment.findUniqueOrThrow({
          where: { id: appointmentId },
          include: { service: { select: { name: true, price: true } }, client: { select: { name: true } } },
        });
        // Invariante DURA, dentro de la transacción: el profesional cobra LO SUYO. El
        // veredicto completo ya se resolvió antes de abrir la tx (ver arriba); esto queda
        // igual por si alguien llama a esta acción por otro camino.
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

// ── Corrección de cobros: anular y condonar (src/lib/turnos/anulacion.ts) ──
//
// Hasta acá un cobro mal cargado quedaba grabado para siempre: `Collection` se creaba y no
// se tocaba nunca más, y el libro rechaza borrar una VENTA con "corregilo desde Turnos" —
// pero Turnos no tenía con qué. El día cerraba con un faltante inexplicable en un medio y
// un sobrante en el otro, y el cierre los congelaba como ajuste. Estas dos acciones son la
// salida; si desaparecen, vuelve eso.

/**
 * Anula UN cobro concreto: asienta la contrapartida (una `Collection` negativa que baja
 * Σ cobros), revierte el asiento del libro con un EGRESO del mismo monto, medio y fecha
 * contable, y recalcula el `Payment` agregado. Idempotente: anular dos veces no duplica la
 * reversa. Auditada con el motivo, que es obligatorio.
 *
 * MISMA capacidad y MISMO veredicto que cobrar (`agenda:collect` + `puedeCobrarEsteTurno`):
 * quien puede tomar la plata es quien puede devolverla. Si la profesional que cobra aparte
 * es la única que puede cobrar su turno, es también la única que puede anular ese cobro —
 * lo contrario dejaría a la recepción deshaciendo plata que no manejó.
 */
export async function anularCobroTurno(formData: FormData): Promise<ResultadoAccion> {
  const user = await requireCapability("agenda:collect");
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const collectionId = String(formData.get("collectionId") || "").trim();
  const appointmentId = String(formData.get("appointmentId") || "").trim();
  if (!collectionId || !appointmentId) return { ok: false, error: "Falta identificar el cobro a anular." };

  const motivoV = validarMotivo(formData.get("motivo") as string | null);
  if (!motivoV.ok) return { ok: false, error: mensajeMotivoInvalido(motivoV.error) };

  const tenantId = await getCurrentTenantId();
  const actor = `user:${user.id}`;

  // Mismo orden que el cobro: el permiso se resuelve ANTES de abrir la transacción (fallar
  // acá no escribe nada y devuelve una frase accionable, no una tx abortada a medias).
  const delTurno = await leerProfesionalDelTurno(appointmentId);
  const veredicto = puedeCobrarEsteTurno({
    rol: user.role,
    professionalIdDelUsuario: user.professionalId,
    professionalIdDelTurno: delTurno.professionalId,
    nombreProfesional: delTurno.nombre,
    cobraEnMostrador: delTurno.cobraEnMostrador,
  });
  if (!veredicto.ok) return { ok: false, error: veredicto.motivo };

  // La frontera de congelamiento se lee una vez, fuera de la tx: es estado del tenant, no
  // del turno. La regla la aplica el repositorio contra la fecha CONTABLE del asiento.
  const diaCerradoHasta = await lastClosedDay(tenantId);

  const run = (withSchema: boolean) =>
    tenantTransaction(
      async (tx) => {
        const appointment = await tx.appointment.findUniqueOrThrow({
          where: { id: appointmentId },
          include: { service: { select: { price: true } } },
        });
        // Invariante DURA dentro de la tx, igual que en el cobro: la profesional toca LO SUYO.
        if (user.role === "PROFESSIONAL" && appointment.professionalId !== user.professionalId) {
          throw new Error("Ese turno es de otra profesional: sólo podés anular cobros de los tuyos.");
        }
        return anularCobroTurnoInTx(tx, tenantId, {
          collectionId,
          appointmentId,
          precio: appointment.priceAtBooking ?? appointment.service.price,
          motivo: motivoV.motivo,
          actor,
          diaCerradoHasta,
          esDiaCerrado: (dia, hasta) => isFrozenDay(dia as DayKey, hasta as DayKey),
          diaDe: dateStrInBusinessTz,
          withSchema,
        });
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  // Mismo guardado schema-ahead que el cobro: si `CashMovement.collectionId` o
  // `Collection.idempotencyKey` no están migradas, el cobro tampoco las usó — la reversa se
  // asienta igual, sin clave persistente ni movimiento de libro (no hay libro que revertir).
  let settled: SettleOutcome<AnularCobroResult>;
  try {
    settled = await settleAppointmentPaymentGuarded({
      runWithBridge: () => run(true),
      runWithoutBridge: () => run(false),
    });
  } catch (e) {
    if (e instanceof AnulacionRechazada) return { ok: false, error: e.message };
    throw e;
  }

  if (settled.outcome === "race" || !settled.value.applied) {
    // Otro submit ya dejó la contrapartida. No se re-audita ni se muestra un error: para
    // quien aprieta el botón dos veces, el cobro está anulado, que es lo que quería.
    revalidatePath("/admin/turnos");
    revalidatePath("/admin/turnos/lista");
    return { ok: true };
  }
  if (settled.outcome === "degraded") {
    logger.warn("caja", "anularCobroTurno: reversa asentada SIN puente al libro de caja (migración de cobros parciales sin aplicar)", {
      tenantId,
      appointmentId,
      collectionId,
    });
  }

  await auditAdmin({
    action: "void_collection",
    entity: "Appointment",
    entityId: appointmentId,
    changes: {
      collectionId,
      motivo: motivoV.motivo,
      monto: settled.value.monto,
      cobrado: settled.value.cobradoDespues,
      saldo: settled.value.saldoDespues,
      libroCaja: settled.outcome === "degraded" ? "sin-migrar" : settled.value.libro,
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

/**
 * Da de baja el saldo incobrable de un turno ya prestado. SIN plata: el libro de caja no se
 * toca, no se inventa un cobro. El turno deja de figurar en "Saldos a cobrar" y se destraba
 * su comisión (`sePuedeLiquidar` exige el turno saldado).
 *
 * `agenda:manage`, no `agenda:collect`: perdonar plata es una decisión del negocio (dueña o
 * mostrador), no parte de cobrar. La profesional que cobra lo suyo no decide qué se regala.
 *
 * NO tiene guarda de día cerrado a propósito: no escribe una sola fila en el libro, así que
 * no puede mover el saldo de un día ya contado.
 */
export async function condonarSaldoTurno(formData: FormData): Promise<ResultadoAccion> {
  const user = await requireCapability("agenda:manage");
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  const appointmentId = String(formData.get("appointmentId") || "").trim();
  if (!appointmentId) return { ok: false, error: "Falta identificar el turno." };

  const motivoV = validarMotivo(formData.get("motivo") as string | null);
  if (!motivoV.ok) return { ok: false, error: mensajeMotivoInvalido(motivoV.error) };

  const tenantId = await getCurrentTenantId();
  const actor = `user:${user.id}`;

  const run = (withSchema: boolean) =>
    tenantTransaction(
      async (tx) => {
        const appointment = await tx.appointment.findUniqueOrThrow({
          where: { id: appointmentId },
          include: { service: { select: { price: true } } },
        });
        return condonarSaldoTurnoInTx(tx, tenantId, {
          appointmentId,
          status: appointment.status,
          precio: appointment.priceAtBooking ?? appointment.service.price,
          motivo: motivoV.motivo,
          actor,
          withSchema,
        });
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  let settled: SettleOutcome<CondonarSaldoResult>;
  try {
    settled = await settleAppointmentPaymentGuarded({
      runWithBridge: () => run(true),
      runWithoutBridge: () => run(false),
    });
  } catch (e) {
    if (e instanceof CondonacionRechazada) return { ok: false, error: e.message };
    throw e;
  }

  if (settled.outcome === "race") {
    // Dos submits a la vez y ganó el otro: para quien apretó el botón, el saldo quedó dado de
    // baja, que es lo que quería. No es un error.
    revalidatePath("/admin/turnos");
    revalidatePath("/admin/turnos/lista");
    return { ok: true };
  }
  if (!settled.value.applied) {
    // Este turno YA tenía un saldo dado de baja, de antes, y no se inventa otro (idempotencia
    // capa 1). Devolvía `{ ok: true }` mudo, o sea la pantalla decía que se hizo algo que no se
    // hizo: si el saldo cambió desde aquella condonación —porque se anuló un cobro—, la
    // recepción aprieta el botón, ve todo bien y el saldo sigue ahí. Rehacer o deshacer una
    // condonación es otra operación, con su propia auditoría, y todavía no existe: hasta que
    // exista, esto por lo menos deja de mentir.
    revalidatePath("/admin/turnos");
    revalidatePath("/admin/turnos/lista");
    return {
      ok: false,
      error: "Este turno ya tiene un saldo dado de baja. Si cambió, todavía no se puede rehacer desde acá: escribinos.",
    };
  }

  await auditAdmin({
    action: "write_off_balance",
    entity: "Appointment",
    entityId: appointmentId,
    changes: { motivo: motivoV.motivo, monto: settled.value.monto, condonacionId: settled.value.condonacionId },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
  revalidatePath("/admin/reportes");
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
  // "Confirmar turnos de mañana" también ofrece este botón (MananaConfirmar.tsx).
  revalidatePath("/admin/turnos/manana");
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
  //
  // UN SOLO RELOJ. Esta función tenía dos: filtraba por `Payment.createdAt` (cuándo entró la
  // plata) y después agrupaba por día con `Appointment.startsAt` (cuándo se prestó el
  // servicio). El total nunca divergió de la suma de las filas —las dos salen del mismo
  // array—, así que no se veía en un control cruzado; lo que mentía era CADA FILA: un turno
  // del lunes cobrado el miércoles sumaba al lunes, aparecían días fuera del período (hasta
  // futuros, por las señas) y había días en $0 habiendo entrado plata.
  // Ahora el reporte contesta UNA pregunta —cuánta plata entró cada día— y lo DICE en
  // pantalla. "Cuánto facturaron los servicios de marzo" es otra pregunta, igual de legítima,
  // y necesita su propia vista: la falla no era usar dos relojes, era no decir cuál.
  //
  // Y los bordes se snapean al día de negocio. Eran un instante a media tarde, así que la
  // primera fila siempre era un día PARCIAL sin nada que lo dijera.
  const { desde, hasta } = bordesDelPeriodo(todayInBusinessTz(), rangeDays, businessWallTimeToUtc);
  const payments = await prisma.payment.findMany({
    where: { tenantId, status: "APPROVED", createdAt: { gte: desde, lte: hasta } },
    select: {
      amount: true,
      createdAt: true,
      appointment: {
        select: {
          professional: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // La agrupación vive en `report-ingresos.ts`, pura y con el reloj inyectado. Está afuera
  // porque era lo ÚNICO de esta función que ningún test cubría (el del CSV le pasaba `[]`),
  // y por eso el defecto de los dos relojes sobrevivió a una auditoría de once dimensiones.
  const agrupado = agruparIngresos(
    payments.map((p) => ({
      amount: p.amount,
      cobradoEn: p.createdAt,
      profesional: p.appointment.professional.name,
      servicio: p.appointment.service.name,
    })),
    dateStrInBusinessTz,
  );

  return { rangeDays, desde, hasta, ...agrupado };
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

// Cancelar SÓLO un turno vivo (Reservado o Confirmado). Antes cancelaba cualquier estado: la
// agenda esconde el botón en un turno completado, pero la acción es un endpoint y se puede
// llamar directo, y un turno COMPLETADO ya tiene cobros, factura y comisión colgados. La
// condición va en el `where` del update (como `confirmarTurno`), así también gana la carrera
// de dos recepcionistas: si otra lo completó un segundo antes, esto no toca nada.
//
// Sin cambios en la firma (la usa un `<form action>`): un rechazo no escribe ni audita, deja
// constancia en el log y la agenda se vuelve a pintar con el estado real del turno.
export async function cancelAppointment(formData: FormData) {
  await requireCapability("agenda:manage");
  if (isDemoSandbox()) return; // modo demo: no persiste
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const tenantId = await getCurrentTenantId();
  const cambiados = await cancelarTurnoVivo(prisma, tenantId, appointmentId);
  if (cambiados === 0) {
    logger.warn("agenda", "cancelación rechazada: el turno no está reservado ni confirmado", { appointmentId });
    revalidatePath("/admin/turnos");
    return;
  }
  await auditAdmin({ action: "cancel", entity: "Appointment", entityId: appointmentId });
  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  // El hueco que se libera aparece en la lista de espera (huecos liberados).
  revalidatePath("/admin/espera");
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

// ── Las fichas que ofrece el alta de turno (campo "Clienta") ─────────────────
//
// Por cada ficha: nombre, teléfono, notas, si es vecina, su última visita y el saldo que
// debe. La recepción la ve al buscarla o al tipear el teléfono, antes de dar el turno.
//
// Se proyecta campo por campo y el cálculo queda del lado del servidor: al navegador viaja
// el RESUMEN por clienta, no los turnos (ver el encabezado de turnos/lista/page.tsx sobre lo
// que pesaba la página). Última visita y saldo miran el último año, la misma ventana que la
// lista de turnos: una visita o un saldo de hace más de un año no aparece acá (sí en la ficha).
const FICHAS_ALTA_RANGO_DIAS = 365;

export async function getFichasParaAlta(): Promise<FichaParaAlta[]> {
  await requireCapability("agenda:manage");
  if (isDemoSandbox()) return [];
  const tenantId = await getCurrentTenantId();
  const desde = new Date(Date.now() - FICHAS_ALTA_RANGO_DIAS * 24 * 60 * 60 * 1000);
  const [clientes, completados] = await Promise.all([
    prisma.client.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        notes: true,
        isResident: true,
        createdAt: true,
        _count: { select: { appointments: true } },
      },
    }),
    prisma.appointment.findMany({
      where: { tenantId, status: "COMPLETED", startsAt: { gte: desde } },
      select: {
        id: true,
        clientId: true,
        status: true,
        startsAt: true,
        priceAtBooking: true,
        service: { select: { name: true, price: true } },
        professional: { select: { name: true } },
        payment: { select: { status: true, amount: true } },
      },
    }),
  ]);
  const cobros = await cobrosDetalladosPorTurno(prisma, tenantId, completados.map((a) => a.id));
  return resumirFichasParaAlta(
    clientes,
    completados.map((a) => ({
      clientId: a.clientId,
      status: a.status,
      startsAt: a.startsAt,
      precio: a.priceAtBooking ?? a.service.price,
      servicio: a.service.name,
      profesional: a.professional.name,
      cobros: cobros.get(a.id) ?? [],
      pagoLegado: a.payment,
    })),
  );
}

// ── "Mañana: confirmar" (/admin/turnos) ──────────────────────────────────────
//
// Los turnos Reservados y Confirmados del DÍA SIGUIENTE DEL NEGOCIO (Buenos Aires, no el
// servidor), con el texto del recordatorio ya armado: la plantilla APPOINTMENT_REMINDER por
// WhatsApp del panel /admin/recordatorios (o la de siempre) y la hora de acá. La recepción
// toca "WhatsApp", se abre el chat con ese texto, y el turno queda "avisada HH:MM".
//
// Es lo manual y no depende del cron: el recordatorio automático hoy no llega a estos turnos
// (ver el comentario de la ventana en src/lib/cron/reminder-sweep.ts).
export type TurnoAConfirmar = {
  id: string;
  /** La ficha de la clienta: con un teléfono que no es celular, la fila lleva a corregirlo ahí. */
  clientId: string;
  startsAt: string;
  status: "PENDING" | "CONFIRMED";
  clienta: string;
  telefono: string;
  servicio: string;
  profesional: string;
  texto: string;
  avisadaEl: string | null;
};

export async function getMananaConfirmar(): Promise<{ dia: string; turnos: TurnoAConfirmar[] }> {
  await requireCapability("agenda:manage");
  const dia = diaSiguiente(todayInBusinessTz());
  if (isDemoSandbox()) return { dia, turnos: [] };
  const tenantId = await getCurrentTenantId();
  const { desde, hasta } = rangoDelDia(dia);
  const [turnos, plantilla] = await Promise.all([
    prisma.appointment.findMany({
      // El MISMO `where` que el número de "Confirmar mañana" y la cobertura de Recordatorios.
      where: whereTurnosDeManana(tenantId, desde, hasta),
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        status: true,
        reminderSentAt: true,
        clientId: true,
        client: { select: { name: true, phone: true } },
        service: { select: { name: true } },
        professional: { select: { name: true } },
      },
    }),
    prisma.messageTemplate.findFirst({
      where: { tenantId, type: "APPOINTMENT_REMINDER", channel: "WHATSAPP", active: true },
      select: { body: true },
    }),
  ]);
  return {
    dia,
    turnos: turnos.map((t) => ({
      id: t.id,
      clientId: t.clientId,
      startsAt: t.startsAt.toISOString(),
      status: t.status === "PENDING" ? "PENDING" : "CONFIRMED",
      clienta: t.client.name,
      telefono: t.client.phone,
      servicio: t.service.name,
      profesional: t.professional.name,
      texto: textoRecordatorio(plantilla?.body, {
        clientName: t.client.name,
        serviceName: t.service.name,
        professionalName: t.professional.name,
        startsAt: t.startsAt,
      }),
      avisadaEl: t.reminderSentAt ? t.reminderSentAt.toISOString() : null,
    })),
  };
}

/**
 * Deja el turno como "avisada" cuando la recepción manda el recordatorio a mano por WhatsApp.
 * Estampa `reminderSentAt` —la misma columna que usa el cron, así el barrido no le vuelve a
 * mandar— con un update acotado por tenant: el id viene del navegador.
 *
 * Qué NO puede saber: si el mensaje efectivamente se envió. Se estampa al abrir el chat con el
 * texto listo, que es lo que el sistema ve. Por eso la pantalla dice "avisada HH:MM" y no
 * "recibido".
 */
export async function marcarAvisada(appointmentId: string): Promise<{ ok: true; avisadaEl: string } | { ok: false; error: string }> {
  await requireCapability("agenda:manage");
  if (isDemoSandbox()) return { ok: true, avisadaEl: new Date().toISOString() };
  const id = String(appointmentId || "");
  if (!id) return { ok: false, error: "Falta el turno." };
  const tenantId = await getCurrentTenantId();
  const ahora = new Date();
  const res = await prisma.appointment.updateMany({
    where: { id, tenantId, status: { in: ["PENDING", "CONFIRMED"] } },
    data: { reminderSentAt: ahora },
  });
  if (res.count === 0) return { ok: false, error: "Ese turno ya no está reservado ni confirmado." };
  await auditAdmin({
    action: "reminder_manual",
    entity: "Appointment",
    entityId: id,
    changes: { reminderSentAt: ahora, canal: "whatsapp-manual" },
  });
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/manana");
  return { ok: true, avisadaEl: ahora.toISOString() };
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
  const tenantId = await getCurrentTenantId();

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
      // El MISMO `where` que el número de Agenda en el Inicio (acotado al profesional si es él).
      where: {
        ...whereTurnosDelDia(tenantId, dayStart, dayEnd),
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

  return { professionals, appointments: await conCobros(tenantId, appointments), blocksToday };
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
      // Reservados que TODAVÍA NO LLEGARON: los que hay que confirmar. Antes contaba todos los
      // PENDING de la historia, incluidos los de hace meses que nadie cerró — esos no son "a
      // confirmar", son turnos sin cerrar, y la lista los muestra aparte. El borde es "ahora" y
      // no las 00:00 para que el número coincida con la sección "Reservados, a confirmar" de la
      // lista, a la que lleva la tarjeta (misma regla: `seccionDeLista`).
      prisma.appointment.count({ where: { status: "PENDING", startsAt: { gte: new Date() } } }),
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
