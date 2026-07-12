-- ROLLBACK de add_tenant_fiscal_credential (ADR-066). Manual (§C).
-- Revierte estructura pura (tabla nueva, sin datos dependientes de otras tablas).
-- ⚠️ Al dropear se PIERDE el material cifrado cargado (hay que volver a cargar los
--    certificados por tenant tras un re-apply). No hay datos de negocio en riesgo.

DROP TABLE IF EXISTS "TenantFiscalCredential";
