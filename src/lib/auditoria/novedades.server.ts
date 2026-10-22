// ============================================================================
// NOVEDADES DE LA CAJA — la lectura (servidor). La regla de qué sube y cómo se dice: novedades.ts.
// ============================================================================
//
// Sólo para quien ve la plata del negocio (`reports:read`, la dueña): a la recepción no se le muestra
// (CH-056) y la lectura ni se hace. Desde ayer a las 00:00 (hora del negocio), las acciones de
// `ACCIONES_DE_NOVEDAD`, con el predicado `tenantId` además de RLS (CH-067) — el índice
// `AuditLog [tenantId, createdAt]` la hace barata —, y después dos lecturas chicas para los nombres
// (usuarios del negocio y la clienta de los turnos con seña devuelta), también por `tenantId`.
// No escribe nada.

import "server-only";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { isDemoSandbox } from "@/lib/demo-flag";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { ACCIONES_DE_NOVEDAD, TOPE_DE_NOVEDADES, idsParaNombrar, novedadesDeLaCaja, type Novedad } from "./novedades";

/** Cuántas filas de auditoría se leen como mucho (las que no suben se descartan en memoria). */
const FILAS_A_LEER = 60;

function ayer(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Las novedades de la caja desde ayer, de la más nueva a la más vieja, sin lo que hizo quien mira.
 * `null` = quien mira no ve la plata (no se le muestra el bloque).
 */
export async function leerNovedadesDeLaCaja(): Promise<Novedad[] | null> {
  const user = await requireCapability("dashboard:read");
  if (!roleHasCapability(user.role, "reports:read")) return null;
  if (isDemoSandbox()) return [];
  const tenantId = await getCurrentTenantId();
  const desde = businessWallTimeToUtc(ayer(todayInBusinessTz()), "00:00");

  const filas = await prisma.auditLog.findMany({
    where: { tenantId, createdAt: { gte: desde }, action: { in: [...ACCIONES_DE_NOVEDAD] } },
    orderBy: { createdAt: "desc" },
    take: FILAS_A_LEER,
    select: { id: true, action: true, entity: true, entityId: true, actor: true, createdAt: true, changes: true },
  });
  if (filas.length === 0) return [];

  const { usuarios, turnos } = idsParaNombrar(filas);
  const [gente, citas] = await Promise.all([
    usuarios.length > 0 ? prisma.user.findMany({ where: { tenantId, id: { in: usuarios } }, select: { id: true, name: true } }) : Promise.resolve([]),
    turnos.length > 0
      ? prisma.appointment.findMany({ where: { tenantId, id: { in: turnos } }, select: { id: true, client: { select: { name: true } } } })
      : Promise.resolve([]),
  ]);
  const nombreDe = new Map(gente.map((u) => [u.id, u.name]));
  const clientaDe = new Map(citas.map((a) => [a.id, a.client?.name ?? null]));
  return novedadesDeLaCaja(
    filas,
    { usuario: (id) => nombreDe.get(id), clientaDelTurno: (id) => clientaDe.get(id) },
    { excluirActor: `user:${user.id}`, tope: TOPE_DE_NOVEDADES },
  );
}
