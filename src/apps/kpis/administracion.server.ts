// ============================================================================
// NÚMEROS DE ADMINISTRACIÓN — Usuarios y Auditoría.
// ============================================================================
//
// Mismas reglas que todos los loaders de esta carpeta (ver mostrador.server.ts).

import { businessWallTimeToUtc } from "@/lib/datetime";
import { fmtNumberAR } from "@/components/ui/format";
import { plural, type LoaderKpi } from "./nucleo.server";

/**
 * "3 activos": los usuarios que hoy pueden entrar. La pantalla (`getUsers`, user-actions.ts)
 * lista a todos los del negocio y marca "dado de baja" a los que tienen `active` en false.
 */
export const usuarios: LoaderKpi = async ({ db, tenantId }) => {
  const n = await db.user.count({ where: { tenantId, active: true } });
  return { valor: fmtNumberAR(n), detalle: plural(n, "activo", "activos") };
};

/**
 * "24 acciones hoy": lo que quedó registrado desde las 00:00 del día del negocio. La pantalla
 * (`getAuditLog`, audit.ts) lista lo último registrado, lo más nuevo arriba.
 */
export const auditoria: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const n = await db.auditLog.count({
    where: { tenantId, createdAt: { gte: businessWallTimeToUtc(hoy, "00:00") } },
  });
  return { valor: fmtNumberAR(n), detalle: `${plural(n, "acción", "acciones")} hoy` };
};

export const LOADERS_ADMINISTRACION: Readonly<Record<string, LoaderKpi>> = { usuarios, auditoria };
