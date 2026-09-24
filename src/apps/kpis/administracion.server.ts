// ============================================================================
// NÚMEROS DE ADMINISTRACIÓN — Usuarios y Auditoría.
// ============================================================================
//
// Mismas reglas que todos los loaders de esta carpeta (ver mostrador.server.ts).

import { filtrosDeHoy, whereAuditoria } from "@/app/admin/(dashboard)/auditoria/filtros";
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
 * "24 acciones hoy": el MISMO `where` que la pantalla con el período "Hoy" (`whereAuditoria` de
 * auditoria/filtros.ts, del día del negocio de 00:00 a 00:00). El tile abre la Auditoría con ese
 * filtro puesto (`hrefDelTile`, inicio/href-del-tile.ts), así el número y la lista coinciden.
 */
export const auditoria: LoaderKpi = async ({ db, tenantId, hoy }) => {
  const n = await db.auditLog.count({ where: { tenantId, ...whereAuditoria(filtrosDeHoy(hoy)) } });
  return { valor: fmtNumberAR(n), detalle: `${plural(n, "acción", "acciones")} hoy` };
};

export const LOADERS_ADMINISTRACION: Readonly<Record<string, LoaderKpi>> = { usuarios, auditoria };
