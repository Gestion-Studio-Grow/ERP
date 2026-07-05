-- ============================================================================
-- ROLLBACK de 0001 (+ 0003) — ADR-018
-- ============================================================================
-- Quita la policy tenant_isolation y desactiva RLS (y FORCE) en toda tabla con
-- tenantId. Idempotente. Para limpiar una branch de ensayo de Neon o revertir
-- un gate. Data-driven, igual que 0001.
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
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

COMMIT;
