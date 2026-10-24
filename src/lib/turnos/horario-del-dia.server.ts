// ============================================================================
// EL HORARIO DE TRABAJO DEL DÍA — para que la grilla no ofrezca huecos fuera de horario (Tanda 2).
// ============================================================================
//
// UNA lectura por día que se mira: las filas de `WorkingHours` de ese día de la semana para las
// profesionales de la agenda, con `tenantId` en el where además de RLS. La grilla las convierte en
// bloqueos (`bloqueosPorHorario`, turnos/grilla.ts). No escribe nada ni toca datos maestros.
// En la agenda de muestra (demo) no hay horario: devuelve `null` y la grilla no marca nada.

import "server-only";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { dayOfWeekForDate } from "@/lib/datetime";

export type HorarioLeido = { profesionalId: string; desde: string; hasta: string };

/** El horario de cada profesional ESE día ("YYYY-MM-DD"). `null` si no hay qué leer (demo, día raro). */
export async function horariosDelDia(dia: string, profesionalIds: readonly string[]): Promise<HorarioLeido[] | null> {
  await requireCapability("agenda:read");
  if (isDemoSandbox() || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const ids = [...new Set(profesionalIds)].filter((x) => typeof x === "string" && x.length > 0).slice(0, 100);
  if (ids.length === 0) return [];
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.workingHours.findMany({
    where: { tenantId, dayOfWeek: dayOfWeekForDate(dia), professionalId: { in: ids } },
    select: { professionalId: true, startTime: true, endTime: true },
  });
  return filas.map((f) => ({ profesionalId: f.professionalId, desde: f.startTime, hasta: f.endTime }));
}
