-- ROLLBACK de add_viajes_presupuestos (módulo VIAJES). Manual (§C).
-- Revierte estructura pura: 9 tablas + 8 enums nuevos, sin dependencias de otras tablas.
-- ⚠️ Al dropear se PIERDEN pedidos, presupuestos, ofertas capturadas y asignaciones de la
--    agencia. Correr solo si el módulo no entró en operación (Gate 2 revertido antes de vender).

DROP TABLE IF EXISTS "CacheBusquedaViaje";
DROP TABLE IF EXISTS "ConsumoProveedorViaje";
DROP TABLE IF EXISTS "AsignacionOfertaViaje";
DROP TABLE IF EXISTS "OfertaCapturadaViaje";
DROP TABLE IF EXISTS "OpcionPresupuestoViaje";
DROP TABLE IF EXISTS "NivelPresupuestoViaje";
DROP TABLE IF EXISTS "PresupuestoViaje";
DROP TABLE IF EXISTS "TramoSolicitudViaje";
DROP TABLE IF EXISTS "SolicitudViaje";
DROP TYPE IF EXISTS "TipoBusquedaViaje";
DROP TYPE IF EXISTS "EstadoPresupuestoViaje";
DROP TYPE IF EXISTS "EstadoSolicitudViaje";
DROP TYPE IF EXISTS "IncluyeImpuestosViaje";
DROP TYPE IF EXISTS "CertezaOfertaViaje";
DROP TYPE IF EXISTS "BaseOcupacionViaje";
DROP TYPE IF EXISTS "UnidadPrecioViaje";
DROP TYPE IF EXISTS "TipoOfertaViaje";
