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
import { isColumnMissing } from "@/lib/prisma-errors";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";
import { isDemoSandbox } from "@/lib/demo-flag";
import type { ResultadoAccion } from "@/lib/actions";
import { seniaDelServicio } from "./cobros";
import { ACCION_SENIA_PEDIDA, ultimaSeniaPedida } from "./senia-pedida";
import { nailArtistDelNegocio } from "@/cambios/interruptores.server";
import { changesDelSnapshot, seniaDeLaProfesional, SENIA_SIN_ALIAS, type SnapshotSeniaProfesional } from "./senia-profesional";

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
  // Box «Nail Artist»: la seña de un servicio marcado va al alias de la profesional DEL TURNO y se
  // congela en la fila. Sin alias, no se pide por transferencia (nunca al alias del negocio).
  const aProfesional = await seniaProfesionalDelTurno(tenantId, turno.id, monto);
  if (aProfesional && !aProfesional.ok) return { ok: false, error: SENIA_SIN_ALIAS };
  const changes = aProfesional?.ok ? { ...changesDelSnapshot(aProfesional.snapshot), canal: "turno" } : { monto, canal: "turno" };
  await auditAdmin({ action: ACCION_SENIA_PEDIDA, entity: "Appointment", entityId: turno.id, changes });
  return { ok: true };
}

/**
 * Con el interruptor `nail-artist` prendido (exige la migración aplicada), resuelve la cuenta de la
 * seña por `appointment.professionalId`. `null` = camino de siempre (interruptor apagado o servicio
 * sin la marca). No exportada como acción: la llaman `marcarSeniaPedida` y `darTurno`.
 */
async function seniaProfesionalDelTurno(
  tenantId: string,
  appointmentId: string,
  monto: number,
): Promise<{ ok: true; snapshot: SnapshotSeniaProfesional } | { ok: false } | null> {
  if (!(await nailArtistDelNegocio())) return null;
  // Columna sin migrar (interruptor prendido antes de tiempo) → el camino de siempre, no un 500.
  const t = await prisma.appointment
    .findFirst({
      where: { id: appointmentId, tenantId },
      select: {
        professionalId: true,
        service: { select: { depositToProfessional: true } },
        professional: { select: { id: true, name: true, aliasCbu: true, titularCuenta: true, cuitTitular: true } },
      },
    })
    .catch((err: unknown) => {
      if (isColumnMissing(err)) return null;
      throw err;
    });
  if (!t) return null;
  const r = seniaDeLaProfesional({
    nailArtist: true,
    depositToProfessional: t.service.depositToProfessional,
    appointment: { professionalId: t.professionalId },
    profesional: t.professional,
    monto,
  });
  if (!r.aplica) return null;
  return r.ok ? { ok: true, snapshot: r.snapshot } : { ok: false };
}

/** Para `darTurno` (alta-actions.ts): misma resolución que `marcarSeniaPedida`. */
export async function changesDeSeniaPedida(
  appointmentId: string,
  monto: number | null,
  canal: string,
): Promise<{ ok: true; changes: Record<string, unknown>; cuenta: SnapshotSeniaProfesional | null } | { ok: false; error: string }> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const r = monto && monto > 0 ? await seniaProfesionalDelTurno(tenantId, appointmentId, monto) : null;
  if (r && !r.ok) return { ok: false, error: SENIA_SIN_ALIAS };
  if (r?.ok) return { ok: true, changes: { ...changesDelSnapshot(r.snapshot), canal }, cuenta: r.snapshot };
  return { ok: true, changes: { monto, canal }, cuenta: null };
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
