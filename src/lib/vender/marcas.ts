// ============================================================================
// ENTIDAD DE LAS TECLAS FIJADAS DEL MOSTRADOR EN AuditLog — constante pura, sin importar nada.
// ============================================================================
//
// Vive sola (como envios/marcas.ts) para que la pueda importar la retención de la auditoría
// (audit-retention.ts, PURGE_EXEMPT_ENTITIES) sin traerse Prisma. La fila más nueva de esta entidad
// (entityId = tenantId) son las teclas que el dueño eligió tener siempre a mano en Vender: si la
// purga la borrara, a los 18 meses las teclas volverían solas a las de siempre.

export const ENTIDAD_TECLAS_FIJADAS = "TeclasFijadas";

/** La acción de las filas de `TeclasFijadas`: se guarda la lista entera. */
export const ACCION_FIJAR_TECLAS = "fijar";
