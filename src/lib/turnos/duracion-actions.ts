"use server";

// ============================================================================
// ESTIRAR UN TURNO — cambiar cuánto dura desde la grilla (AGENDA-INTERACCION.md §2.3, T2).
// ============================================================================
//
// `cambiarDuracionDelTurno(fd)`: campos `appointmentId` y `endsAt` (ISO). Cambia SÓLO el fin del
// turno: ni la hora de inicio, ni la profesional, ni el box, ni el precio, ni el estado. Por eso no
// hay aviso de WhatsApp (la clienta llega a la misma hora). El Deshacer de la grilla llama a esta
// misma action con el `endsAt` anterior.
//
// Reglas (la pantalla las anticipa con `veredictoDeDuracion`, mover-core.ts; la verdad es ésta):
//   · `agenda:manage` (la misma capacidad que `rescheduleAppointment`); un PROFESSIONAL hoy no la
//     tiene, y si algún día la tuviera, sólo estira lo suyo (ADR-017 §2.b).
//   · el turno se lee por id + `tenantId` escrito a mano además de RLS: un id de otro negocio
//     contesta «Ese turno ya no existe» y no escribe nada.
//   · `endsAt` > `startsAt`, la duración en pasos de 15', mínimo 15', dentro del mismo día; si
//     alarga, no pasa del cierre de la profesional ese día.
//   · sólo un turno vivo (Reservado o Confirmado), re-chequeado DENTRO de la transacción.
//   · el choque se valida con `assertSlotAvailable` (booking-core.ts, la misma regla del alta y de
//     mover) con `excludeAppointmentId`, en `bookingTransaction` (Serializable con reintentos): dos
//     recepcionistas que estiran y mueven a la vez no dejan dos turnos en el mismo recurso.
//   · audita `resize` con el fin de antes y el de ahora.

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { isDemoSandbox } from "@/lib/demo-flag";
import { bookingTransaction } from "@/lib/rls";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";
import { withBuffer } from "@/lib/booking-slots";
import { BUFFER_MIN } from "@/lib/business-config";
import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { RechazoDeDominio, rechazoDeDominio } from "@/lib/rechazo-de-dominio";
import type { ResultadoAccion } from "@/lib/actions";

const MIN = 60_000;
/** Paso del estiramiento (minutos): el mismo que la manija y Shift+flechas. */
const PASO_DURACION_MIN = 15;
/** Un turno no dura más que un día de grilla. */
const DURACION_MAXIMA_MIN = 24 * 60;

export async function cambiarDuracionDelTurno(fd: FormData): Promise<ResultadoAccion> {
  const user = await requireCapability("agenda:manage");
  if (isDemoSandbox()) return { ok: true }; // modo demo: no persiste
  try {
    await cambiarDuracion(fd, user);
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return {
      ok: false,
      error: rechazoDeDominio(e, "No se pudo cambiar la duración del turno. Probá de nuevo; si sigue, avisá a GSG.", "agenda.duracion"),
    };
  }
}

async function cambiarDuracion(fd: FormData, user: { role: string; professionalId?: string | null }): Promise<void> {
  const tenantId = await getCurrentTenantId();
  const appointmentId = String(fd.get("appointmentId") ?? "").trim();
  const endsAtIso = String(fd.get("endsAt") ?? "").trim();
  if (!appointmentId || !endsAtIso) throw new RechazoDeDominio("Faltan datos para cambiar la duración del turno.");
  const endsAt = new Date(endsAtIso);
  if (Number.isNaN(endsAt.getTime())) throw new RechazoDeDominio("Esa hora de fin no se pudo leer. Probá de nuevo.");

  const turno = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { id: true, status: true, startsAt: true, endsAt: true, professionalId: true, boxId: true, serviceId: true },
  });
  if (!turno) throw new RechazoDeDominio("Ese turno ya no existe. Recargá la agenda.");
  if (user.role === "PROFESSIONAL" && turno.professionalId !== user.professionalId) {
    throw new RechazoDeDominio("Ese turno es de otra profesional: sólo podés cambiar los tuyos.");
  }
  if (turno.status !== "PENDING" && turno.status !== "CONFIRMED") {
    throw new RechazoDeDominio("Sólo se cambia la duración de un turno reservado o confirmado.");
  }

  const duracionMin = (endsAt.getTime() - turno.startsAt.getTime()) / MIN;
  if (duracionMin <= 0) throw new RechazoDeDominio("El turno tiene que terminar después de que empieza.");
  if (duracionMin < PASO_DURACION_MIN) throw new RechazoDeDominio(`Lo mínimo es ${PASO_DURACION_MIN} minutos.`);
  if (!Number.isInteger(duracionMin) || duracionMin % PASO_DURACION_MIN !== 0) {
    throw new RechazoDeDominio(`La duración va de a ${PASO_DURACION_MIN} minutos.`);
  }
  if (duracionMin > DURACION_MAXIMA_MIN) throw new RechazoDeDominio("Un turno no puede durar más de un día.");
  if (endsAt.getTime() === turno.endsAt.getTime()) throw new RechazoDeDominio("Ya termina a esa hora: no se cambió nada.");

  // Si alarga, no pasa del cierre de la profesional ese día (acortar siempre se puede).
  if (endsAt > turno.endsAt) {
    const ventana = await getWorkingWindow(turno.professionalId, dateStrInBusinessTz(turno.startsAt));
    if (!ventana || endsAt > ventana.dayEnd) {
      throw new RechazoDeDominio(`A esa hora la profesional ya no atiende${ventana ? ` (cierra a las ${fmtTime(ventana.dayEnd)})` : ""}.`);
    }
  }

  await bookingTransaction(async (tx) => {
    // Vivo y de ESTE negocio, otra vez adentro: si otra recepcionista lo canceló o lo cerró entre
    // la lectura de arriba y ahora, no se estira un turno muerto.
    const vivo = await tx.appointment.findFirst({
      where: { id: appointmentId, tenantId, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { startsAt: true, professionalId: true, boxId: true },
    });
    if (!vivo || vivo.startsAt.getTime() !== turno.startsAt.getTime() || vivo.professionalId !== turno.professionalId) {
      throw new RechazoDeDominio("Ese turno cambió recién. Recargá la agenda.");
    }

    // Con quién se pisa, en criollo («Se pisa con Ana a las 17:00»), con el MISMO margen que
    // `assertSlotAvailable`; la regla completa (box, bloqueos, recursos) la aplica ella después.
    const { startsAt: conMargenDesde, endsAt: conMargenHasta } = withBuffer(turno.startsAt, endsAt, BUFFER_MIN);
    const pisa = await tx.appointment.findFirst({
      where: {
        tenantId,
        id: { not: appointmentId },
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: conMargenHasta },
        endsAt: { gt: conMargenDesde },
        OR: [{ professionalId: vivo.professionalId }, { boxId: vivo.boxId }],
      },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, client: { select: { name: true } } },
    });
    if (pisa) throw new RechazoDeDominio(`Se pisa con ${pisa.client.name} a las ${fmtTime(pisa.startsAt)}.`);

    await assertSlotAvailable(tx, {
      professionalId: vivo.professionalId,
      boxId: vivo.boxId,
      serviceId: turno.serviceId,
      startsAt: turno.startsAt,
      endsAt,
      excludeAppointmentId: appointmentId,
    });

    await tx.appointment.update({ where: { id: appointmentId, tenantId }, data: { endsAt } });
  });

  await auditAdmin({
    action: "resize",
    entity: "Appointment",
    entityId: appointmentId,
    changes: { from: { endsAt: turno.endsAt }, to: { endsAt } },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/turnos");
  revalidatePath("/admin/turnos/lista");
}
