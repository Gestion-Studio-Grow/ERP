// ============================================================================
// MARCAS DEL TORNEO WPE — constantes puras, sin importar nada (las lee la retención de la auditoría).
// ============================================================================

/**
 * Entidad de `AuditLog` donde se guarda la FOTO del torneo (GSG-PLAT-016, estado-repo.ts): la fila de versión más
 * alta es el estado vigente. La purga de la auditoría no la toca: purgado, el negocio perdería el torneo entero.
 * El tamaño lo controla la poda del propio repositorio.
 */
export const ENTIDAD_TORNEO_ESTADO = "TorneoEstado";

/** Entidad del rastro de cada mutación (quién y qué). Sigue la retención normal de la auditoría. */
export const ENTIDAD_TORNEO_MUTACION = "TorneoMutacion";

/** El módulo y la app del torneo (Tenant.modules, src/modules/descriptors/torneo.ts). */
export const MODULO_TORNEO = "torneo";
