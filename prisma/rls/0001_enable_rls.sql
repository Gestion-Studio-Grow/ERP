-- ============================================================================
-- 0001 — RLS de Postgres por tenant — ADR-018 (mecanismo B + gate T2)
-- ============================================================================
-- Backstop de aislamiento multi-tenant a NIVEL DE BASE. Complementa (no
-- reemplaza) el filtro app-level de src/lib/tenant.ts: aunque una query olvide
-- el `where tenantId`, la DB no devuelve ni deja escribir filas de otro tenant.
--
-- Mecanismo (ADR-018 §3): cada request abre una transacción y setea el tenant
-- actual con `SELECT set_config('app.current_tenant_id', <cuid>, true)`
-- (transaction-scoped == SET LOCAL, pero parametrizable → pooling-safe en el
-- pooler de Neon en modo transacción). Las policies filtran por ese GUC.
--
-- `tenantId` es cuid (TEXTO, verificado en schema.prisma) → se compara texto
-- contra texto, SIN cast a uuid (ADR-018 §2.a).
--
-- current_setting(..., true): el 2º arg `true` = missing_ok → devuelve NULL si
-- el GUC no está seteado. `"tenantId" = NULL` es NULL → la fila NO pasa el
-- filtro y el INSERT/UPDATE NO pasa el WITH CHECK. Es decir: SIN contexto de
-- tenant, no se ve ni se escribe NADA (fail-closed, coherente con ADR-015).
--
-- ── DATA-DRIVEN, A PRUEBA DE DRIFT ──────────────────────────────────────────
-- En vez de listar tablas a mano (que se desincroniza cuando alguien agrega un
-- modelo con tenantId y olvida su policy — justo el leak que RLS evita), este
-- script recorre information_schema y le pone policy a TODA tabla de `public`
-- que tenga una columna `tenantId`. Cubre las de hoy y las futuras (Order,
-- OrderItem, y lo que venga) sin editar este archivo. La red estática que
-- verifica que ningún modelo "de tenant" se quede sin la columna es
-- prisma/rls/check-coverage.mjs.
--
-- ENFORCEMENT: RLS NO se aplica al DUEÑO de la tabla (neondb_owner) — Postgres
-- exime al owner salvo FORCE ROW LEVEL SECURITY. Deliberado:
--   * El owner conserva bypass para migraciones, seed.ts y el script de
--     provisioning del 2º tenant (ADR-019), que escriben cross-tenant.
--   * El enforcement real lo da conectar la APP como `app_user` (sin BYPASSRLS,
--     NO owner) — ver 0002_app_role.sql. Recién con DATABASE_URL apuntando a
--     app_user las policies se aplican a la app.
-- Corolario: aplicar SOLO este 0001 NO cambia el comportamiento mientras la app
-- siga como owner → seguro de aplicar; el enforcement se enciende al rotar la
-- credencial. Hardening para forzar RLS también al owner: 0003_force_rls_optional.sql.
--
-- EXCLUIDA a propósito: "Tenant" (raíz del aislamiento, sin tenantId — se lee
-- pre-contexto en la resolución por request; ponerle RLS es deadlock de
-- bootstrap). El join M2M "_ProfessionalServices" no tiene tenantId y queda
-- fuera del loop por construcción: está protegido transitivamente porque sus
-- extremos (Professional, Service) sí tienen policy.
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS + CREATE; ENABLE RLS no falla si ya estaba.
--
-- NO APLICADA A PRODUCCIÓN. Aplicar es Gate 2 (OK explícito de Maxi), junto con
-- provisionar el 2º tenant. Ver prisma/rls/README.md.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  t text;
  n int := 0;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema
     AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenantId'
      AND tb.table_type = 'BASE TABLE'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
      || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      t
    );
    n := n + 1;
    RAISE NOTICE 'RLS activado en %', t;
  END LOOP;
  RAISE NOTICE 'RLS: % tablas con tenantId protegidas', n;
END
$$;

COMMIT;

-- Post-check (correr aparte para auditar; debe listar 1 policy por tabla con tenantId):
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND policyname = 'tenant_isolation'
--   ORDER BY tablename;
