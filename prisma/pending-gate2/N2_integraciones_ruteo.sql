-- ============================================================================
-- N2_integraciones_ruteo — funciones de ruteo de avisos por conexión (paso 6 bis del paquete,
--                          ANTES de la re-ejecución de 0001)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01) · ADR-018
-- ============================================================================
--
-- QUIÉN LA USA: el ruteo de avisos entrantes por conexión (P1-C5 / P5-C3 / P6-C1). Pedido por
-- CERT-P1 «Traspasos → Firma por negocio» y CERT-S1 «Lo que haría falta para el ruteo por
-- conexión»; sumado al paquete en el pase N2 (28/10/2026).
--
-- POR QUÉ: con la app como `app_rls` y sin negocio en el GUC, la RLS esconde
-- `IntegracionConexion`; hoy `conexionesDelConector` (src/integraciones/conexiones.server.ts)
-- recorre negocio por negocio, una transacción cada uno (alcanza con el tope de 20). Estas dos
-- funciones dan la misma respuesta en UNA consulta, sin abrir la tabla a la app.
-- HOY NINGÚN CÓDIGO LAS LLAMA: el código sigue con el recorrido por negocio. Pasarlo a estas
-- funciones (con `hayFuncion` en schema-probe y caída al recorrido sin ellas) es de P5/P6.
--
-- QUÉ DEVUELVEN: sólo ("tenantId", id). Nunca credenciales, `config`, `rutaHash`, `etiqueta` ni
-- `cuentaExterna`; nunca conexiones `pendiente`, `pausada` ni `desconectada`; nunca negocios
-- sin el conector en `Tenant.modules`. El secreto de firma se sigue abriendo dentro de la
-- transacción de cada negocio candidato. Orden: el MISMO que el código (`createdAt` desc, id
-- desc; conexiones.server.ts), para que `elegirPorFirma` tome la misma «más reciente».
--
-- SECURITY DEFINER: corren con los permisos de quien las crea (en Neon, el rol directo de
-- MIGRATE_DATABASE_URL = `neondb_owner`, dueño de las tablas). `search_path = pg_catalog, pg_temp`
-- y tablas calificadas con `public.`: un rol con CREATE en `public` no puede meter un operador o
-- una función que gane la resolución y corra con los permisos del dueño (cert. del pase, F5).
-- 🔴 Si el que las crea no es dueño de `IntegracionConexion` ni tiene BYPASSRLS, o si se aplica
-- `prisma/rls/0003_force_rls_optional.sql`, las dos devuelven 0 filas: el bloque DO del final
-- AVISA (WARNING) en los dos casos.
--
-- ADITIVA · IDEMPOTENTE (CREATE OR REPLACE) · una transacción. Reversa al pie.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.gsg_conexion_por_cuenta(p_conector text, p_cuenta text)
RETURNS TABLE("tenantId" text, id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c."tenantId", c.id
    FROM public."IntegracionConexion" c
    JOIN public."Tenant" t ON t.id = c."tenantId"
   WHERE c.conector = p_conector
     AND c."cuentaExterna" = p_cuenta
     AND c.estado::text IN ('conectada', 'con_problemas', 'requiere_reconectar')
     AND COALESCE(t."modules", '{}'::text[]) @> ARRAY[p_conector];
$$;

-- `tope + 1` filas: si vuelven más que el tope, el llamador sabe que se pasó (fail-closed, como
-- TOPE_CONEXIONES_POR_FIRMA) sin traer la tabla entera. Tope acotado a [0, 1000]; NULL = 0.
CREATE OR REPLACE FUNCTION public.gsg_conexiones_activas(p_conector text, p_tope int)
RETURNS TABLE("tenantId" text, id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c."tenantId", c.id
    FROM public."IntegracionConexion" c
    JOIN public."Tenant" t ON t.id = c."tenantId"
   WHERE c.conector = p_conector
     AND c.estado::text IN ('conectada', 'con_problemas', 'requiere_reconectar')
     AND COALESCE(t."modules", '{}'::text[]) @> ARRAY[p_conector]
   ORDER BY c."createdAt" DESC, c.id DESC
   LIMIT LEAST(GREATEST(COALESCE(p_tope, 0), 0), 1000)::bigint + 1;
$$;

REVOKE ALL ON FUNCTION public.gsg_conexion_por_cuenta(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gsg_conexiones_activas(text, int) FROM PUBLIC;

-- `app_rls` lo crea prisma/rls/0002_app_role.sql (ya aplicado en prod). Si no existe (base local
-- sin 0002), no se otorga nada y no falla.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT EXECUTE ON FUNCTION public.gsg_conexion_por_cuenta(text, text) TO app_rls;
    GRANT EXECUTE ON FUNCTION public.gsg_conexiones_activas(text, int) TO app_rls;
  END IF;
END $$;

DO $$
DECLARE
  sin_bypass boolean := NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper));
  forzada boolean;
  dueno text;
BEGIN
  SELECT relforcerowsecurity, pg_get_userbyid(relowner) INTO forzada, dueno
    FROM pg_class WHERE oid = 'public."IntegracionConexion"'::regclass;
  IF sin_bypass AND (forzada OR dueno <> current_user) THEN
    RAISE WARNING 'gsg_conexion_por_cuenta / gsg_conexiones_activas devolverán 0 filas: % no tiene BYPASSRLS y la tabla IntegracionConexion % (dueño %)',
      current_user, CASE WHEN forzada THEN 'tiene FORCE RLS' ELSE 'no es suya' END, dueno;
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA (sin pérdida de datos: no hay datos):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.gsg_conexiones_activas(text, int);
--   DROP FUNCTION IF EXISTS public.gsg_conexion_por_cuenta(text, text);
--   COMMIT;
