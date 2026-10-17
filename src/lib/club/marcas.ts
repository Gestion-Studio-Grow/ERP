// ============================================================================
// MARCAS DEL CLUB — constantes puras, sin importar nada.
// ============================================================================
//
// Viven solas para que las lea la retención de la auditoría (audit-retention.ts, que corre con un doble de
// base y no puede traer Prisma ni el motor del club).

/**
 * Entidad de `AuditLog` donde se guarda la FOTO del estado del club (BP-3, src/lib/club/estado-repo.ts): la fila
 * de versión más alta es el estado vigente. La purga de la auditoría no la toca: purgada, el club perdería sus
 * turnos, sus cuentas y su caja. El tamaño lo controla la poda del propio repositorio.
 */
export const ENTIDAD_CLUB_ESTADO = "ClubEstado";
