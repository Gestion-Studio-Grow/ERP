// ============================================================================
// LA AGENDA DE UN RANGO DE DÍAS — el loader de la Semana (reingeniería CH, Tanda 3 · CH-036/066).
// ============================================================================
//
// Lo que la semana necesita, en UNA tanda de lecturas en paralelo (una ida y vuelta a la base), cada
// una con el predicado `tenantId` además de RLS:
//   · las profesionales activas (con su box);
//   · los turnos del rango que no se cancelaron — UNA consulta para los 7 días, no una por día —, con
//     sólo lo que la cuenta usa (profesional, inicio, fin, estado, precio congelado);
//   · las ausencias (franco, médico) que tocan el rango;
//   · el horario de trabajo (`WorkingHours`) de las profesionales del negocio, todos los días.
// No escribe nada ni toca datos maestros. La cuenta vive en `semana-core.ts` (pura, con test).
//
// Mismos permisos que la agenda del día (`getAgendaDay`): `agenda:read`, y la PROFESIONAL ve sólo lo
// suyo (fail-closed sin `professionalId`: un id que no existe no trae nada). En la agenda de muestra
// no hay base: devuelve la semana vacía sin horario (la pantalla no inventa ocupación).

import "server-only";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { businessWallTimeToUtc } from "@/lib/datetime";
import type { AgendaDeLaSemana } from "@/app/admin/(dashboard)/turnos/_agenda/semana-core";

/** Tope de días de un rango (una semana con domingo; más es otra pantalla). */
export const DIAS_DEL_RANGO = 7;

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function masDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * La agenda de los `dias` días que arrancan en `lunes` (AAAA-MM-DD, hora de pared del negocio), en la
 * forma que arma `armarSemana`.
 */
export async function agendaDelRango(lunes: string, dias = DIAS_DEL_RANGO): Promise<AgendaDeLaSemana> {
  const user = await requireCapability("agenda:read");
  if (!FORMATO_DIA.test(lunes)) throw new Error("El día de la semana no es válido.");
  const n = Math.min(Math.max(1, Math.trunc(dias)), DIAS_DEL_RANGO);
  if (isDemoSandbox()) return { lunes, profesionales: [], turnos: [], ausencias: [], horarios: null };

  const soloDe = user.role === "PROFESSIONAL" ? (user.professionalId ?? "__no_professional__") : null;
  const desde = businessWallTimeToUtc(lunes, "00:00");
  const hasta = businessWallTimeToUtc(masDias(lunes, n), "00:00");
  const tenantId = await getCurrentTenantId();
  const deQuien = soloDe ? { professionalId: soloDe } : {};

  const [profesionales, turnos, ausencias, horarios] = await Promise.all([
    prisma.professional.findMany({
      where: { tenantId, active: true, deletedAt: null, ...(soloDe ? { id: soloDe } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, box: { select: { name: true } } },
    }),
    prisma.appointment.findMany({
      where: { tenantId, startsAt: { gte: desde, lt: hasta }, status: { not: "CANCELLED" }, ...deQuien },
      orderBy: { startsAt: "asc" },
      select: { id: true, professionalId: true, startsAt: true, endsAt: true, status: true, priceAtBooking: true, service: { select: { price: true } } },
    }),
    prisma.professionalBlock.findMany({
      where: { tenantId, startsAt: { lt: hasta }, endsAt: { gt: desde }, ...deQuien },
      select: { professionalId: true, startsAt: true, endsAt: true, reason: true },
    }),
    prisma.workingHours.findMany({
      where: { tenantId, ...deQuien },
      select: { professionalId: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
  ]);

  return {
    lunes,
    profesionales: profesionales.map((p) => ({ id: p.id, nombre: p.name, box: p.box?.name ?? null })),
    turnos: turnos.map((t) => ({
      id: t.id,
      profesionalId: t.professionalId,
      inicio: t.startsAt.toISOString(),
      fin: t.endsAt.toISOString(),
      estado: t.status,
      precio: t.priceAtBooking ?? t.service.price,
    })),
    ausencias: ausencias.map((b) => ({
      profesionalId: b.professionalId,
      desde: b.startsAt.toISOString(),
      hasta: b.endsAt.toISOString(),
      motivo: b.reason,
      tipo: "ausencia" as const,
    })),
    horarios: horarios.map((h) => ({ profesionalId: h.professionalId, diaSemana: h.dayOfWeek, desde: h.startTime, hasta: h.endTime })),
  };
}
