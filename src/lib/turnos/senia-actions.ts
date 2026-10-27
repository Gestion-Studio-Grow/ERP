"use server";

// ============================================================================
// SEÑA PEDIDA — marcarla y leerla (reingeniería CH, Tanda 2, agente 2-A). Ver senia-pedida.ts.
// ============================================================================
//
// `marcarSeniaPedida(fd)`: deja la marca «seña pedida» sobre un turno Reservado (el alta la deja
// sola con `darTurno`; esto es para «Recordar la seña» desde el cajón o la bandeja). No mueve plata
// ni cambia el estado: es una fila de auditoría.
// `seniasPedidas(ids)`: para pintar la marca en la agenda (turno → cuándo se pidió).
//
// Aislamiento: el turno se lee con `tenantId` además de RLS; un id de otro negocio contesta
// «Ese turno ya no existe» y no escribe nada. La lectura filtra la auditoría por `tenantId`.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { isDemoSandbox } from "@/lib/demo-flag";
import type { ResultadoAccion } from "@/lib/actions";
import { seniaDelServicio } from "./cobros";
import { ACCION_SENIA_PEDIDA, ultimaSeniaPedida } from "./senia-pedida";

/** Campos: `appointmentId`. Sólo un turno Reservado que pide seña. */
export async function marcarSeniaPedida(fd: FormData): Promise<ResultadoAccion> {
  await requireCapability("agenda:manage");
  const appointmentId = String(fd.get("appointmentId") ?? "").trim();
  if (!appointmentId) return { ok: false, error: "Falta el turno." };
  if (isDemoSandbox()) return { ok: true };
  const tenantId = await getCurrentTenantId();
  const turno = await prisma.appointment.findFirst({
    where: { id: appointmentId, tenantId },
    select: { id: true, status: true, priceAtBooking: true, service: { select: { price: true, depositAmount: true } } },
  });
  if (!turno) return { ok: false, error: "Ese turno ya no existe. Recargá la agenda." };
  if (turno.status !== "PENDING") return { ok: false, error: "Sólo se pide la seña de un turno reservado." };
  const monto = seniaDelServicio({ depositAmount: turno.service.depositAmount, precio: turno.priceAtBooking ?? turno.service.price });
  if (monto <= 0) return { ok: false, error: "Este servicio no pide seña." };
  await auditAdmin({ action: ACCION_SENIA_PEDIDA, entity: "Appointment", entityId: turno.id, changes: { monto, canal: "turno" } });
  return { ok: true };
}

/** Turno → ISO de la última vez que se pidió su seña (sólo los ids dados, hasta 300, del negocio). */
export async function seniasPedidas(ids: string[]): Promise<Record<string, string>> {
  await requireCapability("agenda:read");
  const unicos = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && x.length > 0 && x.length <= 64))].slice(0, 300);
  if (unicos.length === 0 || isDemoSandbox()) return {};
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.auditLog.findMany({
    where: { tenantId, entity: "Appointment", action: ACCION_SENIA_PEDIDA, entityId: { in: unicos } },
    select: { entityId: true, createdAt: true },
  });
  return ultimaSeniaPedida(filas);
}
