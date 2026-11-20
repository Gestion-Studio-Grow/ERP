-- Vuelta atrás de M8 (T08). Borra las 3 tablas nuevas y lo que M8 agregó a "ProyectoMovBanco" y "ProyectoCuentaBanco".
-- Destructivo: lo corre sólo el dueño (Gate 2), con respaldo. Los saldos de cuenta quedan como estaban (el saldo vive
-- en "ProyectoCuentaBanco"); se pierde el detalle de qué movimiento lo movió y las retenciones registradas.
DROP TABLE IF EXISTS "ProyectoCuotaFactura", "ProyectoCobroRetencion", "ProyectoMovCuenta";
ALTER TABLE "ProyectoMovBanco" DROP CONSTRAINT IF EXISTS "ProyectoMovBanco_origen_check";
DROP INDEX IF EXISTS "ProyectoMovBanco_tenantId_origenTipo_origenId_key";
DROP INDEX IF EXISTS "ProyectoMovBanco_tenantId_cuentaId_huella_key";
ALTER TABLE "ProyectoMovBanco" DROP COLUMN IF EXISTS "origenTipo", DROP COLUMN IF EXISTS "origenId", DROP COLUMN IF EXISTS "huella";
DROP INDEX IF EXISTS "ProyectoCuentaBanco_id_tenantId_key";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261120130000_mia_m8_bancos';
