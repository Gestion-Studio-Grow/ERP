"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

// Punto único de auditoría (ADR-009 §4). Toda mutación de negocio pasa por acá.
// Nunca lanza: una falla al auditar no debe tumbar la operación de negocio, pero
// sí se registra en el log del servidor para no perderla silenciosamente.
export async function audit(entry: {
  actor: string;
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: unknown;
  channel?: "admin" | "public";
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actor: entry.actor,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        changes: entry.changes ? JSON.parse(JSON.stringify(entry.changes)) : undefined,
        channel: entry.channel,
      },
    });
  } catch (err) {
    console.error("[audit] no se pudo registrar la entrada:", entry, err);
  }
}

// Mutación disparada desde el panel admin (sesión con cookie firmada).
export async function auditAdmin(entry: {
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: unknown;
}) {
  return audit({ ...entry, actor: "admin", channel: "admin" });
}

// Mutación disparada desde el sitio público por un cliente final.
export async function auditPublic(entry: {
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: unknown;
  clientPhone?: string;
}) {
  const actor = entry.clientPhone ? `cliente:${entry.clientPhone}` : "cliente";
  return audit({
    actor,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    changes: entry.changes,
    channel: "public",
  });
}

// Best-effort: obtener IP del request para adjuntar al changes cuando aplique.
export async function requestIp(): Promise<string | undefined> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      undefined
    );
  } catch {
    return undefined;
  }
}

export async function getAuditLog(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
