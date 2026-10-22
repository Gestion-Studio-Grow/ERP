/**
 * Entidad de `AuditLog` donde la emisión manual (Facturita) guarda la copia congelada del comprador
 * de un comprobante: nombre, condición frente al IVA y domicilio (`entityId` = id de la factura).
 * Invoice no tiene esas columnas todavía (pendiente: migración).
 *
 * Es un ALMACÉN, no un rastro (lección SEC-5): por eso tiene entidad propia y no `"Invoice"`, y va
 * en `PURGE_EXEMPT_ENTITIES` (la purga de 18 meses borraría el comprador del PDF de una factura
 * que hay que poder reimprimir por años) y en `ENTIDADES_FUERA_DE_LA_AUDITORIA` (datos personales
 * del comprador, no un evento para leer en el panel). Módulo liviano a propósito: lo importan la
 * retención y el panel sin arrastrar Prisma.
 */
export const ENTIDAD_RECEPTOR_DEL_COMPROBANTE = "ComprobanteReceptor";
