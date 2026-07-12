// Resolución del RUBRO del tenant actual para el backoffice (server-only, sin "use
// server": es un lector, no una server action). Reusa la misma estrategia que el resto
// del repo: `Tenant.blueprintId` primero, con fallback al mapa por slug mientras algún
// tenant viejo no tenga blueprint seteado (ver resolveRubroIdBySlug).
//
// Con esto el /admin/catalogo decide si mostrar la sección genérica de spa
// (servicios/boxes/profesionales) o la sección de CORTES del rubro carnicería/retail —
// que es lo que hace que el panel "se sienta hecho para una carnicería".

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import {
  getRetailRubro,
  resolveRubroIdBySlug,
  type RetailRubro,
} from "@/blueprints/retail/rubros";

export interface TenantRubro {
  blueprintId: string | null;
  slug: string | null;
  /** El rubro retail resuelto, o null si el tenant no es retail/mostrador. */
  rubro: RetailRubro | null;
  isRetail: boolean;
}

export async function getCurrentTenantRubro(): Promise<TenantRubro> {
  const tenantId = await getCurrentTenantId();
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { blueprintId: true, slug: true },
  });
  const blueprintId = t?.blueprintId ?? null;
  const slug = t?.slug ?? null;
  const rubro =
    (blueprintId ? getRetailRubro(blueprintId) : null) ??
    getRetailRubro(resolveRubroIdBySlug(slug) ?? "");
  return { blueprintId, slug, rubro, isRetail: rubro != null };
}
