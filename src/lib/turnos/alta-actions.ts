"use server";

// ============================================================================
// DAR TURNO — las Server Actions del alta nueva (reingeniería CH, Tanda 2, agente 2-A).
// ============================================================================
//
// `darTurno(fd, opciones)`: da el turno con `createManualAppointment` (la MISMA acción, los mismos
// campos, el mismo motor de choques, la misma seña dentro de la transacción de la reserva) y
// devuelve lo que la pantalla «Listo ✓» necesita y esa acción no devuelve: el id del turno (para
// «Atender ahora», que abre el cobro de ESE turno), la dirección del local (para el WhatsApp de
// confirmación) y si la seña quedó pedida. `createManualAppointment` no se toca (es de `actions.ts`,
// que esta tanda no edita): el turno se reencuentra por su hueco, que es único — una profesional no
// puede tener dos turnos vivos que empiecen a la misma hora (`assertSlotAvailable`).
//
// `libresAhora(servicioId)`: «Atender ahora» (CH-019). El motor de horarios no ofrece una franja que
// ya empezó (a las 11:05 no ofrece las 11:00), y en el mostrador la clienta ya está ahí: se prueba la
// franja de ahora con cada profesional que hace el servicio, con la MISMA regla de choques que
// valida la reserva (`assertSlotAvailable`, en una transacción de sólo lectura) y su horario del día.
//
// Aislamiento: `tenantId` escrito a mano en cada lectura además de RLS; `requireCapability`.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { tenantTransaction } from "@/lib/rls";
import { assertSlotAvailable, getWorkingWindow } from "@/lib/booking-core";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { createManualAppointment } from "@/lib/actions";
import { isDemoSandbox } from "@/lib/demo-flag";
import { franjaDeAhora } from "@/app/admin/(dashboard)/turnos/_agenda/alta-core";
import { ACCION_SENIA_PEDIDA } from "./senia-pedida";
import { duracionDelCombo, leerServiciosDelCombo } from "./combos";

export type ResultadoDarTurno =
  | {
      ok: true;
      /** El turno recién dado (`null` sólo si no se lo pudo reencontrar: el turno quedó dado igual). */
      id: string | null;
      /** La dirección del local para el WhatsApp (`BusinessSettings.addressLine` + `city`), si está. */
      direccion: string | null;
      /** ¿Quedó la marca «seña pedida»? */
      seniaPedida: boolean;
    }
  | { ok: false; error: string };

/**
 * Da el turno con los campos de siempre (`camposDelAlta`, alta-core.ts) y, si se eligió
 * «Pedírsela por WhatsApp», deja la marca `deposit_requested` en la auditoría del turno.
 */
export async function darTurno(fd: FormData, opciones: { pedirSenia?: boolean; monto?: number } = {}): Promise<ResultadoDarTurno> {
  await requireCapability("agenda:manage");
  const r = await createManualAppointment(fd);
  if (!r.ok) return r;
  if (isDemoSandbox()) return { ok: true, id: null, direccion: null, seniaPedida: false };

  const tenantId = await getCurrentTenantId();
  const professionalId = String(fd.get("professionalId") ?? "");
  const startsAt = new Date(String(fd.get("startsAt") ?? ""));
  const [turno, ajustes] = await Promise.all([
    Number.isNaN(startsAt.getTime())
      ? Promise.resolve(null)
      : prisma.appointment.findFirst({
          where: { tenantId, professionalId, startsAt, status: { in: ["PENDING", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, service: { select: { depositAmount: true } } },
        }),
    prisma.businessSettings.findUnique({ where: { tenantId }, select: { addressLine: true, city: true } }).catch(() => null),
  ]);

  let seniaPedida = false;
  if (opciones.pedirSenia && turno && turno.status === "PENDING") {
    const monto = Number.isFinite(opciones.monto) && (opciones.monto ?? 0) > 0 ? opciones.monto : (turno.service.depositAmount ?? null);
    await auditAdmin({
      action: ACCION_SENIA_PEDIDA,
      entity: "Appointment",
      entityId: turno.id,
      changes: { monto, canal: "alta" },
    });
    seniaPedida = true;
  }

  const direccion = [ajustes?.addressLine?.trim(), ajustes?.city?.trim()].filter(Boolean).join(", ") || null;
  return { ok: true, id: turno?.id ?? null, direccion, seniaPedida };
}

export type LibresAhora = {
  /** ISO del comienzo de la franja de ahora (a las 11:05, las 11:00). */
  inicio: string;
  /** Las profesionales que hacen el servicio y están libres desde esa franja, en orden de nombre. */
  profesionales: string[];
};

/**
 * «Atender ahora»: quiénes de las que hacen `servicioId` pueden atender desde la franja de ahora
 * (su horario de hoy la cubre y no choca con turnos, bloqueos ni recursos).
 */
export async function libresAhora(servicioId: string, zonasPedidas?: unknown): Promise<LibresAhora> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const inicio = new Date(franjaDeAhora(new Date()));
  const vacio: LibresAhora = { inicio: inicio.toISOString(), profesionales: [] };
  if (typeof servicioId !== "string" || !servicioId) return vacio;
  // Combo B (Tanda 3 · 3-B): todas las zonas; el bloque dura la suma y sólo sirven las que hacen todas.
  const lectura = Array.isArray(zonasPedidas) ? leerServiciosDelCombo(zonasPedidas) : null;
  if (lectura && !lectura.ok) return vacio;
  const zonas = lectura?.ok && lectura.ids.length > 1 ? lectura.ids : null;
  if (zonas && zonas[0] !== servicioId) return vacio;

  const servicio = await prisma.service.findFirst({
    where: { id: servicioId, tenantId, active: true, deletedAt: null },
    select: {
      id: true,
      durationMin: true,
      professionals: {
        where: { tenantId, active: true, deletedAt: null, boxId: { not: null } },
        select: { id: true, name: true, boxId: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!servicio) return vacio;
  let durationMin = servicio.durationMin;
  let candidatas = servicio.professionals;
  if (zonas) {
    const filas = await prisma.service.findMany({
      where: { id: { in: zonas }, tenantId, active: true, deletedAt: null },
      select: { durationMin: true, professionals: { where: { tenantId }, select: { id: true } } },
    });
    if (filas.length !== zonas.length) return vacio;
    durationMin = duracionDelCombo(filas);
    candidatas = candidatas.filter((p) => filas.every((f) => f.professionals.some((x) => x.id === p.id)));
  }
  const fin = new Date(inicio.getTime() + durationMin * 60_000);
  const dia = dateStrInBusinessTz(inicio);

  const libres: string[] = [];
  for (const p of candidatas) {
    const ventana = await getWorkingWindow(p.id, dia);
    if (!ventana || inicio < ventana.dayStart || fin > ventana.dayEnd) continue;
    try {
      await tenantTransaction(
        (tx) => assertSlotAvailable(tx, { professionalId: p.id, boxId: p.boxId as string, serviceId: servicio.id, startsAt: inicio, endsAt: fin, serviceIds: zonas ?? undefined }),
        { tenantId },
      );
      libres.push(p.id);
    } catch (e) {
      if (e instanceof RechazoDeDominio) continue;
      throw e;
    }
  }
  return { inicio: inicio.toISOString(), profesionales: libres };
}
