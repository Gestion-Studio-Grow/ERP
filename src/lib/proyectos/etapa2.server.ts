// ============================================================================
// PROYECTOS · Etapa 2 — lector de los interruptores contra la base. Núcleo puro: etapa2-core.ts.
// ============================================================================
// Backoffice: el negocio de la sesión (getCurrentTenantId). Páginas públicas por token: el tenantId
// que resolvió el token, NUNCA el de la sesión. Falla cerrado: si no hay negocio o falla la lectura,
// la parte queda apagada.

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { etapa2Activa, etapa2Estado, MENSAJE_APAGADO, type ParteEtapa2 } from "./etapa2-core";

async function modulosDe(tenantId: string | null | undefined): Promise<string[]> {
  if (!tenantId) return [];
  try {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } });
    return t?.modules ?? [];
  } catch {
    return [];
  }
}

/** ¿La parte está prendida para ESTE negocio (por id)? Para páginas públicas por token. */
export async function etapa2ActivaPara(tenantId: string | null | undefined, parte: ParteEtapa2): Promise<boolean> {
  return etapa2Activa(await modulosDe(tenantId), parte);
}

/** ¿La parte está prendida para el negocio de la sesión? */
export async function etapa2ActivaActual(parte: ParteEtapa2): Promise<boolean> {
  return etapa2ActivaPara(await getCurrentTenantId(), parte);
}

/** Las cinco partes del negocio de la sesión (para la UI). */
export async function etapa2EstadoActual(): Promise<Record<ParteEtapa2, boolean>> {
  return etapa2Estado(await modulosDe(await getCurrentTenantId()));
}

/** Para acciones: null si está prendida; el mensaje en criollo si está apagada. */
export async function errorSiEtapa2Apagada(parte: ParteEtapa2): Promise<string | null> {
  return (await etapa2ActivaActual(parte)) ? null : MENSAJE_APAGADO[parte];
}
