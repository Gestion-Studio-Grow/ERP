"use server";

// ============================================================================
// MOVER UN TURNO — lo que la agenda pregunta ANTES de mover (reingeniería CH, Tanda 2 · 2-C).
// ============================================================================
//
// `huecosParaMover(turnoId, dias, profesionalId?)`: quiénes hacen el servicio del turno y en qué
// horarios entra, sin contar el propio turno. Lo usan el arrastre de la grilla (validar al soltar)
// y «Mover» del cajón (chips de días con sus huecos). Una sola ida al servidor por pregunta: las
// Server Actions del navegador corren de a una, y pedir los huecos de tres profesionales con tres
// llamadas era esperar tres veces.
//
// NO mueve nada: el movimiento es `rescheduleAppointment` (src/lib/actions.ts), el de siempre, que
// re-valida el choque con `assertSlotAvailable` en una transacción del negocio y NUNCA crea un turno.
//
// Aislamiento: el turno y las profesionales se leen con `tenantId` escrito a mano además de RLS; a
// las profesionales se les pide sólo id, nombre y box (antes, «Reprogramar» traía la fila entera
// con email, teléfono y comisión al navegador de la recepción).

import { unstable_rethrow } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getAvailableSlotsRange } from "@/lib/actions";
import { esFechaDeCalendario } from "@/app/admin/(dashboard)/turnos/pasos";

export type ProfesionalParaMover = { id: string; nombre: string; box: string | null };

export type HuecosParaMover =
  | {
      ok: true;
      servicio: string;
      /** Las profesionales activas, con box, que hacen el servicio del turno. */
      profesionales: ProfesionalParaMover[];
      /** profesionalId → día → inicios libres (ISO). Sólo de las pedidas. */
      huecos: Record<string, Record<string, string[]>>;
    }
  | { ok: false; error: string };

/** Tope de días por pregunta: «Mover» pide una semana; nadie necesita más de dos. */
const TOPE_DE_DIAS = 14;

export async function huecosParaMover(turnoId: string, dias: string[], profesionalId?: string | null): Promise<HuecosParaMover> {
  await requireCapability("agenda:manage");
  if (isDemoSandbox()) return { ok: false, error: "En la demo los turnos no se mueven de verdad." };
  const pedidos = [...new Set(Array.isArray(dias) ? dias : [])].filter(esFechaDeCalendario).slice(0, TOPE_DE_DIAS);
  if (typeof turnoId !== "string" || !turnoId || pedidos.length === 0) return { ok: false, error: "Faltan datos para buscar horarios." };

  try {
    const tenantId = await getCurrentTenantId();
    const turno = await prisma.appointment.findFirst({
      where: { id: turnoId, tenantId },
      select: { id: true, status: true, serviceId: true, service: { select: { name: true } } },
    });
    if (!turno) return { ok: false, error: "Ese turno ya no existe. Recargá la agenda." };
    if (turno.status !== "PENDING" && turno.status !== "CONFIRMED") {
      return { ok: false, error: "Sólo se mueve un turno reservado o confirmado." };
    }
    // Las que pueden recibirlo: la misma regla que `rescheduleAppointment` (activa, con box activo,
    // y que haga el servicio — ADR-055).
    const filas = await prisma.professional.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        box: { is: { active: true, deletedAt: null } },
        services: { some: { id: turno.serviceId } },
      },
      select: { id: true, name: true, box: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    const profesionales = filas.map((p) => ({ id: p.id, nombre: p.name, box: p.box?.name ?? null }));
    const aBuscar = profesionalId ? profesionales.filter((p) => p.id === profesionalId) : profesionales;
    const huecos: Record<string, Record<string, string[]>> = {};
    // De a una profesional (cada búsqueda ya junta todos los días en ~7 consultas): no se abren
    // varias conexiones a la vez contra la base.
    for (const p of aBuscar) {
      huecos[p.id] = await getAvailableSlotsRange(p.id, turno.serviceId, pedidos, turno.id);
    }
    return { ok: true, servicio: turno.service.name, profesionales, huecos };
  } catch (e) {
    unstable_rethrow(e);
    logger.error("agenda", "mover: no se pudieron buscar los huecos", e, { turnoId });
    return { ok: false, error: "No pude buscar los horarios libres. Probá de nuevo; si sigue, avisá." };
  }
}
