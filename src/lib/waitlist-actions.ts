"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auditAdmin } from "@/lib/audit-core";
// La regla de precio de ADR-013 vive en UN solo lugar, fuera de todo módulo "use server":
// estuvo enunciada dos veces y la copia de este archivo se quedó atrás. Ver el módulo.
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";
import { getCurrentTenantId } from "@/lib/tenant";
import { bookingTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";
import { getAvailableSlots } from "@/lib/actions";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { buscarFichaPorTelefono, entradaAuditoriaEmpate, type EmpateFichas } from "@/lib/clientes/ficha-por-telefono";
import { unstable_rethrow } from "next/navigation";
import { whereEsperando } from "@/lib/crm/wheres";
import type { ResultadoAccion } from "@/lib/actions";

const WAITLIST_PATH = "/admin/espera";

// ─── Precio congelado del turno: la MISMA regla que el alta normal (ADR-013) ───
//
// Qué pasaba antes y por qué era grave: este archivo creaba el turno con
// `priceAtBooking: service.price` a secas. Una vecina anotada en la lista de espera
// terminaba pagando el precio de no-vecina —justo el segmento que ADR-013 vino a
// proteger— y encima la comisión se devengaba sobre ese precio inflado. El precio
// queda CONGELADO en el turno, así que cobrarlo después por la agenda (que lee
// `priceAtBooking`) no lo corrige: se cobra de más y no lo ve nadie, porque la
// pantalla de espera no muestra precio.
//
// Lista de espera para el panel: los que todavía esperan (WAITING) primero, luego
// los ya avisados (NOTIFIED), ambos en orden de llegada (FIFO — el que hace más
// que espera va arriba). Los resueltos (BOOKED/CANCELLED) no se muestran acá.
export async function getWaitlist() {
  await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();
  return prisma.waitlistEntry.findMany({
    // El MISMO `where` que el número de Lista de espera en el Inicio.
    where: whereEsperando(tenantId),
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
// normalizado (mismo helper que el turno manual, `buscarFichaPorTelefono`) y crea el
// turno dentro de una transacción, re-validando la disponibilidad con assertSlotAvailable
// para cerrar la carrera entre "vi el hueco" y "reservo". No pasa por src/lib/actions.ts a propósito
// (rama de comisiones trabaja ahí) — reusa solo el núcleo de dominio de
// booking-core. El precio se congela con la MISMA regla de vecino que los otros
// tres caminos (ver `precioCongeladoDeReserva` arriba). Sin cupón: la lista de
// espera no pide código y no se inventa uno.
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
  // El servicio también, y acá importa más que en ningún otro camino: un anotado puede
  // llevar SEMANAS en la lista (es su naturaleza), tiempo de sobra para que el catálogo
  // lo desactive o lo borre. Sin esta guarda quedaba un turno agendado contra un servicio
  // dado de baja —con su precio viejo congelado— que recepción tenía que cancelar a mano.
  if (!service.active || service.deletedAt) {
    throw new Error("Ese servicio ya no está disponible.");
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

  // El empate de fichas (si lo hay) se audita DESPUÉS de la transacción: la auditoría escribe
  // por fuera de `tx`, y una transacción Serializable que se reintenta la dejaría duplicada.
  // (El `as` evita que TS lo angoste a `null`: la asignación ocurre adentro del callback.)
  let empate = null as EmpateFichas | null;
  const appointment = await bookingTransaction(async (tx) => {
    await assertSlotAvailable(tx, {
      professionalId,
      boxId,
      serviceId: entry.serviceId,
      startsAt,
      endsAt,
    });

    // La ficha por teléfono NORMALIZADO, con el MISMO helper que el alta manual y la reserva
    // web: "11 4000-7919" anotada en la espera encuentra a la clienta cargada como
    // "1140007919" en vez de crearle una ficha nueva. Adentro de la tx, sobre `tx`.
    const encontrada = await buscarFichaPorTelefono(tx, tenantId, entry.clientPhone);
    empate = encontrada?.empate ?? null;
    let client = encontrada ? await tx.client.findFirst({ where: { id: encontrada.id, tenantId } }) : null;
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

    // El dato de vecina vive en la ficha del Client: la lista de espera no lo pregunta
    // (WaitlistEntry no tiene la columna). Este camino LO LEE pero no lo pisa — sin
    // casilla "vecina" en el alta de espera, lo que diga la ficha es lo mejor que sabemos,
    // y sobreescribirla con `false` le sacaría el beneficio a quien ya lo tenía.
    const { priceAtBooking, isResidentBooking } = precioCongeladoDeReserva(service, client.isResident);

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
        priceAtBooking,
        isResidentBooking,
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

  if (empate) await auditAdmin(entradaAuditoriaEmpate(empate));

  await auditAdmin({
    action: "book_from_waitlist",
    entity: "Appointment",
    entityId: appointment.id,
    // El precio va en la bitácora: es plata congelada en el turno y, si alguna vez
    // se discute cuánto se le cobró a quién, este es el único rastro fuera de la fila.
    changes: {
      waitlistEntryId: entry.id,
      professionalId,
      startsAt: appointment.startsAt,
      priceAtBooking: appointment.priceAtBooking,
      isResidentBooking: appointment.isResidentBooking,
    },
  });

  revalidatePath(WAITLIST_PATH);
  revalidatePath("/admin/turnos");
  revalidatePath("/admin");
}

// ─── Huecos liberados: avisar por WhatsApp y reservar desde el hueco ─────────
//
// "Marcar avisado" sólo cambiaba el estado: no decía quién avisó ni con qué. El bloque de
// huecos liberados (/admin/espera) abre WhatsApp con el texto armado y, en el mismo toque,
// deja la constancia: el anotado pasa a Avisado con la hora, y la auditoría guarda quién y
// por qué hueco. Igual que "Mañana: confirmar", el sistema sabe que se abrió el chat, no que
// el mensaje salió.

export async function avisarHuecoPorWhatsApp(
  entryId: string,
  appointmentId: string,
): Promise<{ ok: true; avisadoEl: string; por: string } | { ok: false; error: string }> {
  const user = await requireCapability("waitlist:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(entryId ?? "").trim();
  const hueco = String(appointmentId ?? "").trim();
  if (!id || !hueco) return { ok: false, error: "Falta el anotado o el hueco." };
  // Los dos ids llegan del navegador: se buscan con el negocio.
  const turno = await prisma.appointment.findFirst({
    where: { id: hueco, tenantId, status: "CANCELLED" },
    select: { startsAt: true, serviceId: true },
  });
  if (!turno) return { ok: false, error: "Ese hueco ya no está libre. Recargá la lista." };
  const ahora = new Date();
  // Sólo un anotado que espera ESE servicio: la constancia dice "se le ofreció este hueco".
  const res = await prisma.waitlistEntry.updateMany({
    where: { id, tenantId, serviceId: turno.serviceId, status: { in: ["WAITING", "NOTIFIED"] } },
    data: { status: "NOTIFIED", notifiedAt: ahora },
  });
  if (res.count === 0) return { ok: false, error: "Esa persona ya no está en la lista de espera." };
  await auditAdmin({
    action: "notify",
    entity: "WaitlistEntry",
    entityId: id,
    changes: { canal: "whatsapp-manual", hueco, startsAt: turno.startsAt },
  });
  revalidatePath(WAITLIST_PATH);
  return { ok: true, avisadoEl: ahora.toISOString(), por: user.name };
}

/**
 * Reservar el hueco liberado para un anotado. Es `bookFromWaitlist` (misma validación del
 * hueco, misma ficha por teléfono, mismo precio congelado), pero DEVUELVE el motivo en vez de
 * tirar: si otra persona tomó el horario un minuto antes, la recepción lee "ese horario ya no
 * está disponible" en la fila, no la pantalla de error genérica.
 */
export async function reservarHuecoLiberado(formData: FormData): Promise<ResultadoAccion> {
  try {
    await bookFromWaitlist(formData);
    return { ok: true };
  } catch (e) {
    // El redirect de la guardia (sin sesión, sin permiso) no es un error: sigue su camino.
    unstable_rethrow(e);
    const sinCodigo = typeof e === "object" && e !== null && !("code" in e);
    const mensaje = e instanceof Error ? e.message : "";
    // Los rechazos de dominio son `Error` con el motivo en castellano; uno de Prisma trae
    // `code` y un volcado técnico que no se muestra.
    if (sinCodigo && mensaje && mensaje.length <= 300) return { ok: false, error: mensaje };
    return { ok: false, error: "No se pudo reservar ese horario. Probá de nuevo o elegí otro con “Buscar horario”." };
  }
}
