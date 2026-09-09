-- ROLLBACK de add_viajes_presupuestos (módulo VIAJES). Manual (§C).
-- Revierte estructura pura: 4 tablas + 3 enums nuevos, sin dependencias de otras tablas.
-- ⚠️ Al dropear se PIERDEN los presupuestos y snapshots cargados por la agencia. Correr
--    solo si el módulo no entró en operación (Gate 2 revertido antes de vender).

DROP TABLE IF EXISTS "CacheBusquedaViaje";
DROP TABLE IF EXISTS "ConsumoProveedorViaje";
DROP TABLE IF EXISTS "OpcionPresupuestoViaje";
DROP TABLE IF EXISTS "PresupuestoViaje";
DROP TYPE IF EXISTS "EstadoPresupuestoViaje";
DROP TYPE IF EXISTS "TipoOfertaViaje";
DROP TYPE IF EXISTS "BaseOcupacionViaje";
