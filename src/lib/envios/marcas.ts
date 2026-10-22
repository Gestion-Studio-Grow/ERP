// ============================================================================
// ENTIDAD DE LA CONFIGURACIÓN DE ENVÍOS EN AuditLog — constante pura, sin importar nada.
// ============================================================================
//
// Vive sola (como supermercado/marcas.ts) para que la pueda importar la retención de la auditoría
// (audit-retention.ts, PURGE_EXEMPT_ENTITIES) sin traerse Prisma ni el resto del módulo. La fila
// más nueva de esta entidad (entityId = tenantId) es la configuración vigente del negocio: si la
// purga la borrara, las zonas y la pausa de la tienda desaparecerían solas.

export const ENTIDAD_CONFIG_ENVIOS = "ConfigEnvios";

/** Acciones de las filas de `ConfigEnvios`: guardar todo, o sólo pausar / reabrir la tienda. */
export const ACCION_GUARDAR_ENVIOS = "guardar";
export const ACCION_PAUSAR_TIENDA = "pausar-tienda";
export const ACCION_REABRIR_TIENDA = "reabrir-tienda";
