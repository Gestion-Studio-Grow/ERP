-- Vuelta atrás de M1 (T05). Borra las 7 tablas nuevas y lo que M1 agregó a "CashMovement" y "ProyectoCuota".
-- Destructivo: lo corre sólo el dueño (Gate 2), con respaldo, y después de anular las órdenes de pago pagadas.
ALTER TABLE "CashMovement" DROP CONSTRAINT IF EXISTS "CashMovement_proyectoOrdenPagoId_tenantId_fkey";
DROP INDEX IF EXISTS "CashMovement_tenantId_proyectoOrdenPagoId_type_key";
ALTER TABLE "CashMovement" DROP COLUMN IF EXISTS "proyectoOrdenPagoId";
DROP TABLE IF EXISTS "ProyectoOrdenPagoLinea", "ProyectoOrdenPago", "ProyectoCuotaComprobante", "ProyectoComprobanteLinea", "ProyectoComprobanteAdjunto", "ProyectoComprobante", "ProyectoNumerador";
DROP INDEX IF EXISTS "ProyectoCuota_id_tenantId_key";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261119100000_mia_m1_comprobantes';
