-- ============================================================================
-- 0003 — (OPCIONAL / HARDENING) FORCE ROW LEVEL SECURITY — ADR-018
-- ============================================================================
-- Defensa en profundidad. Por defecto el DUEÑO de la tabla (neondb_owner) NO
-- está sujeto a RLS; con FORCE, sí. Cierra el hueco de que una conexión
-- accidental como owner (migración de datos, script ad-hoc, rollback de
-- credenciales) lea/escriba cross-tenant.
--
-- ⚠ PRECONDICIÓN: al aplicarlo, TODO acceso —incluido owner— queda obligado a
-- setear `app.current_tenant_id`. Verificar ANTES que seed.ts, el script de
-- provisioning (ADR-019) y cualquier mantenimiento que escriba datos setean el
-- GUC (o usan ALTER TABLE ... NO FORCE temporal). Por eso se separa de 0001 y
-- NO se aplica en el mismo paso: primero se rota la app a app_rls y se valida,
-- después (si se quiere) se fuerza.
--
-- Data-driven, igual que 0001: fuerza RLS en toda tabla con tenantId.
-- Reversa: 0001_rollback.sql (incluye NO FORCE).
-- ============================================================================

BEGIN;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenantId'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

COMMIT;
