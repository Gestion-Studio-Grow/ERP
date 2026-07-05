// Retención de AuditLog (ADR-009 §Retención · ADR-023 F8).
//
// POR QUÉ: `AuditLog` es append-only (cada mutación de negocio agrega una fila y nada la
// borra). Sin retención, es el candidato #1 a agotar los ~0.5 GB del plan free de Neon —y
// cuando el storage se llena, lo que se cae es la ESCRITURA, o sea un incidente de
// disponibilidad, no solo de auditoría. Esto es la POLÍTICA (ventana) + el MECANISMO (purga).
//
// CÓMO SE USA: no se dispara desde el runtime de la app. Se corre a mano/por cron con
// `scripts/purge-audit-logs.ts` (default dry-run). La purga es platform-wide (todos los
// tenants) porque es mantenimiento de la plataforma, no una acción de tenant.

import type { PrismaClient } from "@/generated/prisma/client";

// Solo la parte del cliente Prisma que la purga necesita — se deriva del delegate real
// para garantizar compatibilidad de tipos, pero acota la superficie (inyectable/testeable).
type AuditLogPurgeClient = {
  auditLog: Pick<PrismaClient["auditLog"], "count" | "deleteMany">;
};

// Ventana de retención por defecto, en meses. Holgada a propósito (18 meses cubre
// comparaciones interanuales y auditorías tardías) dentro del rango decidido (12–18m,
// ADR-009). Cuando el storage sea la restricción real (gate a plan pago, ADR-007), se acorta.
export const AUDIT_RETENTION_MONTHS = 18;

/** Fecha de corte: todo lo anterior a esto es purgable. `now`/`months` inyectables para test. */
export function auditRetentionCutoff(months = AUDIT_RETENTION_MONTHS, now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

/**
 * Purga entradas de `AuditLog` más viejas que la ventana de retención. Idempotente
 * (correrla dos veces borra lo que quede; la segunda no encuentra nada). Aprovecha el
 * índice `@@index([tenantId, createdAt])` existente — no requiere migración.
 *
 * `dryRun` (default **true**) solo CUENTA lo que se borraría; nunca borra sin pedirlo
 * explícito. Devuelve el corte y la cantidad afectada para poder loguear/verificar.
 */
export async function purgeAuditLogs(
  client: AuditLogPurgeClient,
  opts: { months?: number; dryRun?: boolean } = {},
): Promise<{ cutoff: Date; affected: number; dryRun: boolean }> {
  const months = opts.months ?? AUDIT_RETENTION_MONTHS;
  const dryRun = opts.dryRun ?? true;
  const cutoff = auditRetentionCutoff(months);
  const where = { createdAt: { lt: cutoff } };

  if (dryRun) {
    return { cutoff, affected: await client.auditLog.count({ where }), dryRun };
  }
  const { count } = await client.auditLog.deleteMany({ where });
  return { cutoff, affected: count, dryRun };
}
