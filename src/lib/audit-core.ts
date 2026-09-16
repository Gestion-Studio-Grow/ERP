// ── AUDITORÍA: el núcleo, DELIBERADAMENTE sin "use server" ──────────────────
//
// Este archivo NO lleva la directiva. Es la única razón por la que existe separado de
// `audit.ts`, y es de seguridad, no de organización.
//
// `"use server"` no marca "esto corre en el servidor": marca **"cada export de este archivo
// es un endpoint HTTP"**. Con la directiva arriba, `audit()` quedaba publicada como Server
// Action y registrada en los workers de rutas PÚBLICAS sin sesión (se verificó contra
// `.next/server/server-reference-manifest.json`: figuraba en `app/(site)/page`, `/servicios`
// y `/reserva`). Y `audit()` no tiene guarda: recibe `actor`, `action`, `entity` y
// `entityId` del llamador y escribe la fila.
//
// Eso no es ruido en la bitácora. `AuditLog` NO es sólo bitácora: `lastClosedDay`
// (`src/lib/caja/frontera-cierre.ts`) resuelve con ella hasta qué día está CERRADO el
// tenant. Una fila forjada con `entity:"CierreDiario"` y `entityId:"9999-12-31"` congelaba
// el libro de caja para siempre — sin pantalla que lo revierta, y exenta de la purga. Se
// salía con SQL a mano contra Neon.
//
// Regla para el que venga: las funciones que ESCRIBEN auditoría viven acá y se llaman desde
// otras server actions, que ya tienen su propia guarda de capability. Lo único que puede
// vivir en un archivo con `"use server"` es lo que un client component invoca de verdad
// —hoy sólo `getAuditLog`, que exige `audit:read`.

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { getCurrentUser } from "@/lib/session";
import { logger } from "@/lib/logger";

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
        tenantId: await getCurrentTenantId(),
        actor: entry.actor,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        changes: entry.changes ? JSON.parse(JSON.stringify(entry.changes)) : undefined,
        channel: entry.channel,
      },
    });
  } catch (err) {
    logger.error("audit", "no se pudo registrar la entrada", err, {
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
    });
  }
}

// Mutación disparada desde el panel admin (sesión con cookie firmada). El actor
// es el usuario real de la sesión (ADR-017 §2.f): `user:<id>`, que la pantalla de
// auditoría resuelve a nombre. Fallback a "admin" solo si no hay usuario resuelto
// (no debería pasar en /admin, pero no dejamos la auditoría sin registrar por eso).
export async function auditAdmin(entry: {
  action: string;
  entity: string;
  entityId?: string | null;
  changes?: unknown;
}) {
  const user = await getCurrentUser();
  const actor = user ? `user:${user.id}` : "admin";
  return audit({ ...entry, actor, channel: "admin" });
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
