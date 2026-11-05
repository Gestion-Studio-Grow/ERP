"use server";

// ============================================================================
// EDITAR UN TURNO — servicio, día, hora y profesional en una sola hoja (agenda interactiva, CH).
// ============================================================================
//
// Tres actions, todas con `agenda:manage` (la misma capacidad que mover) y el `tenantId` de la
// sesión escrito a mano además de RLS:
//   · `opcionesParaEditar(turnoId)`: los servicios activos del negocio con quién los hace y su precio
//     para ESTA clienta, las profesionales que pueden recibir turnos, y si el turno ya tiene plata.
//   · `huecosParaEditar(turnoId, servicioId, profesionalId, dias)`: los huecos del motor de siempre
//     (`getAvailableSlotsRange`) para ese servicio y esa profesional, sin contar el propio turno.
//   · `editarTurno(fd)`: guarda. Si el servicio NO cambia, es la reprogramación de siempre
//     (`rescheduleAppointment` con `conservarDuracion=1`, como el arrastre). Si cambia, acá:
//       - la profesional tiene que hacer el servicio, con box activo, y trabajar en ese horario;
//       - fin = inicio + duración del servicio nuevo; el box sigue a la profesional;
//       - precio: sin cobros ni seña (ni descuento), el vigente del servicio para la clienta; con
//         plata adentro se rechaza («Ya tiene un cobro: cancelalo y dá un turno nuevo»);
//       - en `bookingTransaction` (Serializable): se re-lee el turno y tiene que estar igual que al
//         leerlo (vivo, mismo inicio, fin, profesional, servicio y precio), se re-mira la plata y
//         `assertSlotAvailable` (booking-core.ts) valida el choque excluyéndose a sí mismo;
//       - audita `edit` con el antes y el después.
//     `deshacer=1` (el [Deshacer] de la hoja): vuelve EXACTO al `from` del último `edit` auditado
//     (precio congelado incluido), sólo si el turno sigue como lo dejó ese `edit`.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { agendaInteraccionPrendida } from "@/cambios/interruptores";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { auditAdmin } from "@/lib/audit-core";
import { isDemoSandbox } from "@/lib/demo-flag";
import { bookingTransaction } from "@/lib/rls";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { RechazoDeDominio, rechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { getAvailableSlotsRange, rescheduleAppointment, type ResultadoAccion } from "@/lib/actions";
import { esFechaDeCalendario } from "@/app/admin/(dashboard)/turnos/pasos";
import { cobrosDelTurnoInTx } from "./cobro-turno-repo";
import { precioCongeladoDeReserva } from "./precio-reserva";
import { camposCambiados, esEditable, veredictoDeEdicion, MOTIVO_CON_COBRO } from "./editar-turno";

const MIN = 60_000;
const TOPE_DE_DIAS = 14;

export type ServicioParaEditar = { id: string; nombre: string; duracionMin: number; precio: number; profesionales: string[] };
export type ProfesionalParaEditar = { id: string; nombre: string; box: string | null };
export type OpcionesParaEditar =
  | { ok: true; servicios: ServicioParaEditar[]; profesionales: ProfesionalParaEditar[]; tienePlata: boolean; tieneDescuento: boolean }
  | { ok: false; error: string };

/** ¿Entró plata para este turno? Un cobro o una seña (fila `Collection`) o el pago viejo (`Payment`). */
async function tienePlataInTx(tx: Parameters<typeof cobrosDelTurnoInTx>[0], tenantId: string, appointmentId: string): Promise<boolean> {
  const [cobros, pagos] = await Promise.all([
    cobrosDelTurnoInTx(tx, tenantId, appointmentId),
    tx.payment.count({ where: { tenantId, appointmentId } }),
  ]);
  return cobros.length > 0 || pagos > 0;
}

export async function opcionesParaEditar(turnoId: string): Promise<OpcionesParaEditar> {
  await requireCapability("agenda:manage");
  if (!agendaInteraccionPrendida(await interruptoresDelNegocio())) return { ok: false, error: "Editar turnos no está prendido en tu negocio." };
  if (isDemoSandbox()) return { ok: false, error: "En la demo los turnos no se editan de verdad." };
  if (typeof turnoId !== "string" || !turnoId) return { ok: false, error: "Faltan datos del turno." };
  try {
    const tenantId = await getCurrentTenantId();
    const turno = await prisma.appointment.findFirst({
      where: { id: turnoId, tenantId },
      select: { id: true, status: true, couponCode: true, discountAmount: true, client: { select: { isResident: true } } },
    });
    if (!turno) return { ok: false, error: "Ese turno ya no existe. Recargá la agenda." };
    if (!esEditable(turno.status)) return { ok: false, error: "Sólo se edita un turno reservado o confirmado." };
    const filas = await prisma.professional.findMany({
      where: { tenantId, active: true, deletedAt: null, box: { is: { active: true, deletedAt: null } } },
      select: {
        id: true,
        name: true,
        box: { select: { name: true } },
        services: {
          where: { tenantId, active: true, deletedAt: null },
          select: { id: true, name: true, durationMin: true, price: true, residentPrice: true },
        },
      },
      orderBy: { name: "asc" },
    });
    const porId = new Map<string, ServicioParaEditar>();
    for (const p of filas) {
      for (const s of p.services) {
        const ya = porId.get(s.id);
        if (ya) ya.profesionales.push(p.id);
        else
          porId.set(s.id, {
            id: s.id,
            nombre: s.name,
            duracionMin: s.durationMin,
            precio: precioCongeladoDeReserva(s, turno.client.isResident).priceAtBooking,
            profesionales: [p.id],
          });
      }
    }
    const tienePlata = await tienePlataInTx(prisma, tenantId, turno.id);
    return {
      ok: true,
      servicios: [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      profesionales: filas.map((p) => ({ id: p.id, nombre: p.name, box: p.box?.name ?? null })),
      tienePlata,
      tieneDescuento: !!turno.couponCode || turno.discountAmount > 0,
    };
  } catch (e) {
    unstable_rethrow(e);
    logger.error("agenda", "editar: no se pudieron leer las opciones", e, { turnoId });
    return { ok: false, error: "No pude leer los servicios. Probá de nuevo; si sigue, avisá." };
  }
}

export async function huecosParaEditar(
  turnoId: string,
  servicioId: string,
  profesionalId: string,
  dias: string[],
): Promise<{ ok: true; huecos: Record<string, string[]> } | { ok: false; error: string }> {
  await requireCapability("agenda:manage");
  if (!agendaInteraccionPrendida(await interruptoresDelNegocio())) return { ok: false, error: "Editar turnos no está prendido en tu negocio." };
  if (isDemoSandbox()) return { ok: false, error: "En la demo los turnos no se editan de verdad." };
  const pedidos = [...new Set(Array.isArray(dias) ? dias : [])].filter(esFechaDeCalendario).slice(0, TOPE_DE_DIAS);
  if (!turnoId || !servicioId || !profesionalId || pedidos.length === 0) return { ok: false, error: "Faltan datos para buscar horarios." };
  try {
    const tenantId = await getCurrentTenantId();
    // Los tres del MISMO negocio antes de llamar al motor (que lee servicio y profesional por id).
    const [turno, hace] = await Promise.all([
      prisma.appointment.findFirst({ where: { id: turnoId, tenantId }, select: { id: true, status: true } }),
      prisma.professional.count({
        where: { id: profesionalId, tenantId, active: true, deletedAt: null, services: { some: { id: servicioId, tenantId, active: true, deletedAt: null } } },
      }),
    ]);
    if (!turno) return { ok: false, error: "Ese turno ya no existe. Recargá la agenda." };
    if (!esEditable(turno.status)) return { ok: false, error: "Sólo se edita un turno reservado o confirmado." };
    if (hace === 0) return { ok: false, error: "Esa profesional no hace ese servicio. Elegí otra." };
    return { ok: true, huecos: await getAvailableSlotsRange(profesionalId, servicioId, pedidos, turno.id) };
  } catch (e) {
    unstable_rethrow(e);
    logger.error("agenda", "editar: no se pudieron buscar los huecos", e, { turnoId });
    return { ok: false, error: "No pude buscar los horarios libres. Probá de nuevo; si sigue, avisá." };
  }
}

export async function editarTurno(fd: FormData): Promise<ResultadoAccion> {
  await requireCapability("agenda:manage");
  if (!agendaInteraccionPrendida(await interruptoresDelNegocio())) return { ok: false, error: "Editar turnos no está prendido en tu negocio." };
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  try {
    const resultado = await editar(fd);
    if (resultado) return resultado;
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: rechazoDeDominio(e, "No se pudo editar el turno. Probá de nuevo; si sigue, avisá a GSG.", "agenda.editar") };
  }
}

type FotoDelEdit = {
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  professionalId: string;
  boxId: string;
  priceAtBooking: number | null;
  isResidentBooking: boolean;
};

const fecha = (v: unknown) => (typeof v === "string" || v instanceof Date ? new Date(v) : new Date(NaN));

/** El `from` del último `edit` del turno, si el turno sigue como lo dejó ese `edit` (su `to`). */
async function fotoParaDeshacer(tenantId: string, appointmentId: string, actual: FotoDelEdit): Promise<FotoDelEdit | null> {
  const ultimo = await prisma.auditLog.findFirst({
    where: { tenantId, entity: "Appointment", entityId: appointmentId, action: "edit" },
    orderBy: { createdAt: "desc" },
    select: { changes: true },
  });
  const c = ultimo?.changes as { deshacer?: unknown; from?: Record<string, unknown>; to?: Record<string, unknown> } | null | undefined;
  // Un Deshacer no se deshace (sería rehacer): el [Deshacer] de la pantalla es de un solo toque.
  if (c?.deshacer === true) return null;
  const to = c?.to;
  const from = c?.from;
  if (!to || !from) return null;
  const igual =
    to.serviceId === actual.serviceId &&
    to.professionalId === actual.professionalId &&
    fecha(to.startsAt).getTime() === actual.startsAt.getTime() &&
    fecha(to.endsAt).getTime() === actual.endsAt.getTime();
  if (!igual) return null;
  const startsAt = fecha(from.startsAt);
  const endsAt = fecha(from.endsAt);
  if (typeof from.serviceId !== "string" || typeof from.professionalId !== "string" || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null;
  }
  return {
    serviceId: from.serviceId,
    professionalId: from.professionalId,
    startsAt,
    endsAt,
    boxId: typeof from.boxId === "string" ? from.boxId : actual.boxId,
    priceAtBooking: typeof from.priceAtBooking === "number" ? from.priceAtBooking : null,
    isResidentBooking: from.isResidentBooking === true,
  };
}

/** El cuerpo: TIRA los rechazos de dominio. Devuelve el resultado si delegó en la reprogramación. */
async function editar(fd: FormData): Promise<ResultadoAccion | null> {
  const tenantId = await getCurrentTenantId();
  const appointmentId = String(fd.get("appointmentId") ?? "").trim();
  const deshacer = String(fd.get("deshacer") ?? "") === "1";
  if (!appointmentId) throw new RechazoDeDominio("Faltan datos para editar el turno.");

  const turno = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: {
      id: true,
      status: true,
      serviceId: true,
      startsAt: true,
      endsAt: true,
      professionalId: true,
      boxId: true,
      priceAtBooking: true,
      isResidentBooking: true,
      couponCode: true,
      discountAmount: true,
      client: { select: { isResident: true } },
      service: { select: { name: true } },
    },
  });
  if (!turno) throw new RechazoDeDominio("Ese turno ya no existe. Recargá la agenda.");
  if (!esEditable(turno.status)) throw new RechazoDeDominio("Sólo se edita un turno reservado o confirmado.");

  // Lo elegido. Con `deshacer`, lo dice la auditoría (no el navegador).
  let destino: { serviceId: string; startsAt: Date; professionalId: string; endsAt?: Date; precio?: number | null; isResidentBooking?: boolean };
  if (deshacer) {
    const foto = await fotoParaDeshacer(tenantId, appointmentId, turno);
    if (!foto) throw new RechazoDeDominio("Ese turno cambió recién: no se puede deshacer. Recargá la agenda.");
    destino = { serviceId: foto.serviceId, startsAt: foto.startsAt, professionalId: foto.professionalId, endsAt: foto.endsAt, precio: foto.priceAtBooking, isResidentBooking: foto.isResidentBooking };
  } else {
    const startsAtIso = String(fd.get("startsAt") ?? "").trim();
    const startsAt = startsAtIso ? new Date(startsAtIso) : turno.startsAt;
    if (Number.isNaN(startsAt.getTime())) throw new RechazoDeDominio("Ese horario no se pudo leer. Elegí de nuevo el día y la hora.");
    destino = {
      serviceId: String(fd.get("serviceId") ?? "").trim() || turno.serviceId,
      startsAt,
      professionalId: String(fd.get("professionalId") ?? "").trim() || turno.professionalId,
    };
  }

  const cambios = camposCambiados(
    { estado: turno.status, inicio: turno.startsAt, servicioId: turno.serviceId, profesionalId: turno.professionalId },
    { servicioId: destino.serviceId, inicio: destino.startsAt, profesionalId: destino.professionalId },
  );

  // Sin cambio de servicio: la reprogramación de siempre (sus reglas, su auditoría `reschedule`).
  if (!cambios.servicio && !deshacer) {
    const r = new FormData();
    r.set("appointmentId", appointmentId);
    r.set("startsAt", destino.startsAt.toISOString());
    r.set("professionalId", destino.professionalId);
    r.set("conservarDuracion", "1");
    return rescheduleAppointment(r);
  }

  const [servicio, profesional] = await Promise.all([
    prisma.service.findFirst({
      where: { id: destino.serviceId, tenantId, deletedAt: null, ...(deshacer ? {} : { active: true }) },
      select: { id: true, name: true, durationMin: true, price: true, residentPrice: true },
    }),
    prisma.professional.findFirst({
      where: { id: destino.professionalId, tenantId },
      select: {
        id: true,
        name: true,
        active: true,
        deletedAt: true,
        boxId: true,
        box: { select: { active: true, deletedAt: true } },
        services: { where: { id: destino.serviceId }, select: { id: true } },
      },
    }),
  ]);
  if (!servicio) throw new RechazoDeDominio("Ese servicio ya no está disponible. Elegí otro.");
  if (!profesional || !profesional.active || profesional.deletedAt) throw new RechazoDeDominio("Esa profesional ya no está disponible.");
  if (!profesional.boxId || !profesional.box?.active || profesional.box?.deletedAt) {
    throw new RechazoDeDominio("Esa profesional no tiene un box activo asignado.");
  }

  const tienePlata = await tienePlataInTx(prisma, tenantId, appointmentId);
  const veredicto = veredictoDeEdicion({
    estado: turno.status,
    cambios,
    inicioActual: turno.startsAt,
    inicioNuevo: destino.startsAt,
    ahora: new Date(),
    tienePlata,
    tieneDescuento: !!turno.couponCode || turno.discountAmount > 0,
    profesionalLoHace: profesional.services.length > 0,
  });
  if (!veredicto.ok) {
    if (veredicto.motivo === "Esa profesional no hace ese servicio. Elegí otra.") {
      throw new RechazoDeDominio(`${profesional.name} no hace ${servicio.name}. Elegí una profesional que lo haga.`);
    }
    throw new RechazoDeDominio(veredicto.motivo);
  }

  const startsAt = destino.startsAt;
  const endsAt = destino.endsAt ?? new Date(startsAt.getTime() + servicio.durationMin * MIN);
  const boxId = profesional.boxId;
  const precio = deshacer
    ? { priceAtBooking: destino.precio ?? null, isResidentBooking: destino.isResidentBooking ?? false }
    : precioCongeladoDeReserva(servicio, turno.client.isResident);

  const ventana = await getWorkingWindow(profesional.id, dateStrInBusinessTz(startsAt));
  if (!ventana || startsAt < ventana.dayStart || endsAt > ventana.dayEnd) {
    throw new RechazoDeDominio("Esa profesional no trabaja en ese horario. Elegí otro día u horario.");
  }

  await bookingTransaction(async (tx) => {
    // Igual que cuando se leyó: si otra recepcionista lo movió, lo estiró, lo cerró o le cambió el
    // servicio entre la lectura y ahora, no se pisa su cambio.
    const vivo = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { startsAt: true, endsAt: true, professionalId: true, serviceId: true, priceAtBooking: true },
    });
    if (
      !vivo ||
      vivo.startsAt.getTime() !== turno.startsAt.getTime() ||
      vivo.endsAt.getTime() !== turno.endsAt.getTime() ||
      vivo.professionalId !== turno.professionalId ||
      vivo.serviceId !== turno.serviceId ||
      vivo.priceAtBooking !== turno.priceAtBooking
    ) {
      throw new RechazoDeDominio("Ese turno cambió recién. Recargá la agenda.");
    }
    // La plata otra vez, adentro: una seña que entró recién no queda colgada de otro precio.
    if (await tienePlataInTx(tx, tenantId, appointmentId)) throw new RechazoDeDominio(MOTIVO_CON_COBRO);

    await assertSlotAvailable(tx, {
      professionalId: profesional.id,
      boxId,
      serviceId: servicio.id,
      startsAt,
      endsAt,
      excludeAppointmentId: appointmentId,
    });

    const seMueve = startsAt.getTime() !== turno.startsAt.getTime() || profesional.id !== turno.professionalId;
    await tx.appointment.update({
      where: { id: appointmentId, tenantId },
      data: {
        serviceId: servicio.id,
        startsAt,
        endsAt,
        professionalId: profesional.id,
        boxId,
        priceAtBooking: precio.priceAtBooking,
        isResidentBooking: precio.isResidentBooking,
        // El aviso que se dio era para el horario viejo (como al mover).
        ...(seMueve ? { reminderSentAt: null } : {}),
      },
    });
  });

  await auditAdmin({
    action: "edit",
    entity: "Appointment",
    entityId: appointmentId,
    changes: {
      ...(deshacer ? { deshacer: true } : {}),
      from: {
        serviceId: turno.serviceId,
        servicio: turno.service.name,
        startsAt: turno.startsAt,
        endsAt: turno.endsAt,
        professionalId: turno.professionalId,
        boxId: turno.boxId,
        priceAtBooking: turno.priceAtBooking,
        isResidentBooking: turno.isResidentBooking,
      },
      to: {
        serviceId: servicio.id,
        servicio: servicio.name,
        startsAt,
        endsAt,
        professionalId: profesional.id,
        boxId,
        priceAtBooking: precio.priceAtBooking,
        isResidentBooking: precio.isResidentBooking,
      },
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
  return null;
}
