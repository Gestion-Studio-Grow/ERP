// ============================================================================
// PROYECTOS · Etapa 2 · T5 — portal por cliente: ¿está la tabla? y el link vigente de un cliente (backoffice).
// ============================================================================
// La tabla "PortalCliente" llega con la migración 20261110140000_portal_cliente, SIN aplicar (Gate 2). Antes de
// tocarla se pregunta al catálogo (fuera de RLS y de transacciones). Se recuerda SÓLO el sí: un «no» viejo dejaría el
// link apagado después de aplicar la migración. Si una consulta igual da «la tabla no existe» (P2021), se olvida el sí.
// Lectura pública: portalClientePublico (gestion-lecturas.server.ts). Escrituras: acciones-ficha.ts.

import "server-only";
import { prisma } from "@/lib/prisma";
import { basePrisma } from "@/lib/prisma-base";

let hayTabla = false;

/** ¿Existe la tabla "PortalCliente" en esta base? Error del catálogo → false (falla cerrado: sin link). */
export async function hayTablaPortalCliente(): Promise<boolean> {
  if (hayTabla) return true;
  try {
    const filas = await basePrisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'PortalCliente'`;
    hayTabla = Number(filas?.[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
  return hayTabla;
}

/** ¿El error es «la tabla no existe»? Si lo es, se olvida el sí recordado. */
export function faltaTablaPortalCliente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  const falta = code === "P2021" || code === "42P01";
  if (falta) hayTabla = false;
  return falta;
}

/** El link vigente del cliente en este negocio, o null (sin link o sin tabla). */
export async function tokenPortalDelCliente(tenantId: string, clientId: string): Promise<string | null> {
  if (!(await hayTablaPortalCliente())) return null;
  try {
    const fila = await prisma.portalCliente.findFirst({ where: { tenantId, clientId }, select: { token: true } });
    return fila?.token ?? null;
  } catch (e) {
    if (faltaTablaPortalCliente(e)) return null;
    throw e;
  }
}
