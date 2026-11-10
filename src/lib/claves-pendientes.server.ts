// Ejecutor real de los reseteos pendientes (ver `claves-pendientes.ts`). Sin "use server": lo llama
// sólo la ruta del cron, que pone la guardia (CRON_SECRET).

import { Prisma } from "@/generated/prisma/client";
import { operatorPrisma } from "@/lib/operator-db";
import { AUDIT_ACTION_OWNER_RESET } from "@/lib/must-change-password";
import { resetearClaveDelDuenioConMail } from "@/lib/clave-temporal-entrega.server";
import { enviarMailClaveTemporal } from "@/lib/clave-temporal-mail";
import {
  ACTOR_PENDIENTES,
  correrResetsPendientes,
  type EstadoPendiente,
  type PendientesPort,
  type ResetPendiente,
  type ResultadoPendiente,
} from "@/lib/claves-pendientes";

const YA_ESTABA = "ya-estaba";

/**
 * Dentro de la transacción del reseteo: candado por la clave (dos corridas a la vez se ordenan) y
 * búsqueda de la fila de auditoría que deja el reseteo hecho. Exportado para el test con base.
 */
export async function yaSeHizo(tx: Prisma.TransactionClient, tenantId: string, clave: string): Promise<boolean> {
  await tx.$queryRawUnsafe(`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))) AS candado`, `claves-pendientes:${clave}`);
  const fila = await tx.auditLog.findFirst({
    where: { tenantId, action: AUDIT_ACTION_OWNER_RESET, changes: { path: ["pendiente"], equals: clave } },
    select: { id: true },
  });
  return !!fila;
}

export async function resetearPendiente(
  tenantId: string,
  p: ResetPendiente,
  enviarMail: typeof enviarMailClaveTemporal = enviarMailClaveTemporal,
): Promise<EstadoPendiente> {
  let yaEstaba = false;
  const r = await resetearClaveDelDuenioConMail(
    tenantId,
    {
      actor: ACTOR_PENDIENTES,
      operatorSubject: "claves-pendientes",
      extra: { pendiente: p.clave, motivo: p.motivo },
      antes: async (tx) => {
        if (!(await yaSeHizo(tx, tenantId, p.clave))) return null;
        yaEstaba = true;
        return { ok: false, error: YA_ESTABA };
      },
    },
    enviarMail,
  );
  if (yaEstaba) return { estado: "ya-estaba" };
  return r.ok ? { estado: "hecho", enviadaA: r.enviadaA } : { estado: "fallo", error: r.error };
}

const port = (enviarMail: typeof enviarMailClaveTemporal): PendientesPort => ({
  buscarNegocio: async (slug) =>
    (await operatorPrisma.tenant.findUnique({ where: { slug }, select: { id: true } }))?.id ?? null,
  resetearSiFalta: (tenantId, p) => resetearPendiente(tenantId, p, enviarMail),
});

export function correrResetsPendientesEnLaBase(
  pendientes?: readonly ResetPendiente[],
  enviarMail: typeof enviarMailClaveTemporal = enviarMailClaveTemporal,
): Promise<ResultadoPendiente[]> {
  return correrResetsPendientes(port(enviarMail), pendientes);
}
