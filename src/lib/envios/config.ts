// ============================================================================
// ENVÍOS · LA CONFIGURACIÓN DEL NEGOCIO EN LA BASE — leer y guardar, con control de versión.
// ============================================================================
//
// DÓNDE SE GUARDA. Sin migración, con el patrón de supermercado/config-repo.ts: cada cambio es una
// fila de `AuditLog` (entity "ConfigEnvios", entityId = tenantId) y la vigente es la MÁS NUEVA.
// La tabla tiene `tenantId` con su política de RLS, y el rastro (quién, cuándo, qué) sale gratis.
//
// CONCURRENCIA. Guardar exige la versión que se leyó (el id de la fila vigente, o null si nunca se
// guardó): si otra persona guardó en el medio, se tira `RechazoDeDominio` y se pide volver a mirar,
// en vez de pisarle el cambio. El llamador corre esto en una transacción serializable
// (`tenantTransaction(..., { isolationLevel: Serializable })`).
//
// SIN CONFIGURACIÓN, LO DE SIEMPRE. Si el negocio nunca guardó (o la fila no se puede leer), se
// devuelve `CONFIG_ENVIOS_POR_DEFECTO`: retiro, sin zonas, sin mínimo, abierta. La tienda sigue
// con la tarifa de su copy (`storefront.ts`) y el mostrador como hoy.
//
// Recibe el cliente por parámetro (sin "use server" ni `server-only`): lo usan las acciones, las
// páginas con el cliente de la app y los tests (con un doble o con la base efímera).

import type { Prisma } from "@/generated/prisma/client";
import { RechazoDeDominio } from "@/lib/rechazo-de-dominio";
import { ENTIDAD_CONFIG_ENVIOS, ACCION_GUARDAR_ENVIOS } from "./marcas";
import { configPorDefecto, validarConfigEnvios, type ConfigEnvios, type ZonaDeEnvio } from "./modelo";

export type { ConfigEnvios, ZonaDeEnvio } from "./modelo";
export { CONFIG_ENVIOS_POR_DEFECTO } from "./modelo";

type Db = Pick<Prisma.TransactionClient, "auditLog">;

export const CAMBIO_MIENTRAS_MIRABAS_ENVIOS =
  "Otra persona cambió los envíos mientras los mirabas. Volvé a abrir la pantalla para ver cómo quedaron y hacé tu cambio de nuevo.";

export type ConfigEnviosLeida = ConfigEnvios & {
  /** El id de la fila vigente (lo que se manda de vuelta al guardar); null = nunca se guardó. */
  version: string | null;
};

/** La fila vigente de la configuración del negocio, o undefined. */
async function vigente(db: Db, tenantId: string) {
  const [fila] = await db.auditLog.findMany({
    where: { tenantId, entity: ENTIDAD_CONFIG_ENVIOS, entityId: tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: { id: true, changes: true },
  });
  return fila;
}

/**
 * La configuración de envíos del negocio, o la de siempre si nunca se guardó. Una fila que no se
 * puede leer (no debería pasar: se valida al guardar) también cae a la de siempre, pero conserva
 * su versión para que el próximo guardado no choque.
 */
export async function leerConfigEnvios(db: Db, tenantId: string): Promise<ConfigEnviosLeida> {
  const fila = await vigente(db, tenantId);
  if (!fila) return { ...configPorDefecto(), version: null };
  const v = validarConfigEnvios((fila.changes as { config?: unknown } | null)?.config);
  return { ...(v.ok ? v.config : configPorDefecto()), version: fila.id };
}

/**
 * Guarda la configuración entera con control de versión. Devuelve la versión nueva (el id de la
 * fila). Tira `RechazoDeDominio` si la configuración no es válida o si alguien guardó en el medio.
 */
export async function guardarConfigEnviosEnTx(
  db: Db,
  tenantId: string,
  d: { config: ConfigEnvios; actor: string; versionLeida: string | null; accion?: string },
): Promise<string> {
  const v = validarConfigEnvios(d.config);
  if (!v.ok) throw new RechazoDeDominio(v.error);
  const actual = await vigente(db, tenantId);
  if ((actual?.id ?? null) !== d.versionLeida) throw new RechazoDeDominio(CAMBIO_MIENTRAS_MIRABAS_ENVIOS);
  const fila = await db.auditLog.create({
    data: {
      tenantId,
      actor: d.actor,
      action: d.accion ?? ACCION_GUARDAR_ENVIOS,
      entity: ENTIDAD_CONFIG_ENVIOS,
      entityId: tenantId,
      changes: { config: v.config } as Prisma.InputJsonValue,
      channel: "admin",
    },
    select: { id: true },
  });
  return fila.id;
}
