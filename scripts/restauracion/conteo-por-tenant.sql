-- Conteo de filas por tabla y por tenant. SÓLO LECTURA (únicamente SELECT; sin escritura ni DDL).
-- Uso (prueba de recuperación, docs/runbooks/prueba-recuperacion-manual.md):
--   psql "$URL" -X -q -At -F '|' -v ON_ERROR_STOP=1 -f scripts/restauracion/conteo-por-tenant.sql > conteo.txt
-- Corre igual en la base de la rama (neondb, producción a ese minuto) y en la copia restaurada
-- (prueba_restauracion); las dos salidas se comparan con `diff`. Salida ordenada y determinista.
-- Formato de cada línea: seccion|clave|valor
--   control|...        rol, RLS forzado y última migración (para saber si el conteo ve todo)
--   tabla|<tabla>|n    filas totales de cada tabla de public
--   tenant|<slug>|n    filas sumadas de todas las tablas con columna "tenantId", por tenant
--   detalle|<tabla>/<slug>|n   el mismo conteo, tabla por tabla
-- Ojo RLS: el rol dueño de las tablas ve todo SALVO que haya FORCE ROW LEVEL SECURITY
-- (prisma/rls/0003_force_rls_optional.sql). Si «control|rls_forzado» no da 0 y el rol no tiene BYPASSRLS,
-- el conteo sale incompleto: se frena la prueba y se avisa (no se desactiva RLS a mano).

BEGIN TRANSACTION READ ONLY;

SELECT 'control', 'rol', current_user
UNION ALL
SELECT 'control', 'rol_bypassrls', (rolbypassrls OR rolsuper)::text FROM pg_roles WHERE rolname = current_user
UNION ALL
SELECT 'control', 'tablas_public', count(*)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
UNION ALL
SELECT 'control', 'rls_forzado', count(*)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relforcerowsecurity
UNION ALL
SELECT 'control', 'migraciones_aplicadas', count(*)::text
  FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
UNION ALL
(SELECT 'control', 'ultima_migracion', migration_name
   FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  ORDER BY migration_name DESC LIMIT 1);

-- Filas totales por tabla.
SELECT 'tabla', c.relname,
       (xpath('/row/n/text()',
              query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
 ORDER BY c.relname;

-- Filas por tenant (tabla por tabla y sumadas), con el slug del Tenant.
WITH tablas AS (
  SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenantId' AND NOT a.attisdropped
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
),
conteo AS (
  SELECT t.relname AS tabla, nullif(x.tenant_id, '') AS tenant_id, x.n  -- xsi:nil llega como ''
    FROM tablas t,
         xmltable('/table/row'
                  PASSING query_to_xml(
                    format('SELECT "tenantId" AS tenant_id, count(*) AS n FROM public.%I GROUP BY 1', t.relname),
                    true, false, '')
                  COLUMNS tenant_id text PATH 'tenant_id', n bigint PATH 'n') AS x
),
con_slug AS (
  SELECT c.tabla, coalesce(te.slug, CASE WHEN c.tenant_id IS NULL THEN '(sin tenant)' ELSE '(tenant inexistente)' END) AS slug, c.n
    FROM conteo c LEFT JOIN public."Tenant" te ON te.id = c.tenant_id
)
SELECT 'tenant', slug, sum(n)::text FROM con_slug GROUP BY slug
UNION ALL
SELECT 'detalle', tabla || '/' || slug, sum(n)::text FROM con_slug GROUP BY tabla, slug
ORDER BY 1 DESC, 2;

COMMIT;
