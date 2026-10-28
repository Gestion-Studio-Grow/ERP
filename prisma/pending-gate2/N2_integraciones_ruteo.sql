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
-- transacción de cada negocio candidato.
--
-- SECURITY DEFINER: corren con los permisos de quien las crea (en Neon, el rol directo de
-- MIGRATE_DATABASE_URL = `neondb_owner`). Eso ve las filas porque 0001 activa RLS SIN `FORCE`.
-- 🔴 Si algún día se aplica `prisma/rls/0003_force_rls_optional.sql`, el dueño queda sujeto a RLS
-- y las dos funciones devuelven 0 filas: hace falta un dueño con BYPASSRLS. El bloque DO del
-- final AVISA (WARNING) si encuentra FORCE en `IntegracionConexion` y el dueño no tiene BYPASSRLS.
--
-- ADITIVA · IDEMPOTENTE (CREATE OR REPLACE) · una transacción. Reversa al pie.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION gsg_conexion_por_cuenta(p_conector text, p_cuenta text)
RETURNS TABLE("tenantId" text, id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c."tenantId", c.id
    FROM "IntegracionConexion" c
    JOIN "Tenant" t ON t.id = c."tenantId"
   WHERE c.conector = p_conector
     AND c."cuentaExterna" = p_cuenta
     AND c.estado IN ('conectada', 'con_problemas', 'requiere_reconectar')
     AND p_conector = ANY (t."modules");
$$;

-- `p_tope + 1` filas: si vuelven más que el tope, el llamador sabe que se pasó (fail-closed,
-- como TOPE_CONEXIONES_POR_FIRMA) sin traer la tabla entera.
CREATE OR REPLACE FUNCTION gsg_conexiones_activas(p_conector text, p_tope int)
RETURNS TABLE("tenantId" text, id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c."tenantId", c.id
    FROM "IntegracionConexion" c
    JOIN "Tenant" t ON t.id = c."tenantId"
   WHERE c.conector = p_conector
     AND c.estado IN ('conectada', 'con_problemas', 'requiere_reconectar')
     AND p_conector = ANY (t."modules")
   ORDER BY c."updatedAt" DESC, c.id DESC
   LIMIT GREATEST(p_tope, 0) + 1;
$$;

REVOKE ALL ON FUNCTION gsg_conexion_por_cuenta(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION gsg_conexiones_activas(text, int) FROM PUBLIC;

-- `app_rls` lo crea prisma/rls/0002_app_role.sql (ya aplicado en prod). Si no existe (base local
-- sin 0002), no se otorga nada y no falla.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT EXECUTE ON FUNCTION gsg_conexion_por_cuenta(text, text) TO app_rls;
    GRANT EXECUTE ON FUNCTION gsg_conexiones_activas(text, int) TO app_rls;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid = '"IntegracionConexion"'::regclass AND relforcerowsecurity)
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper)) THEN
    RAISE WARNING 'IntegracionConexion tiene FORCE RLS y % no tiene BYPASSRLS: gsg_conexion_por_cuenta y gsg_conexiones_activas devolverán 0 filas', current_user;
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA (sin pérdida de datos: no hay datos):
--   BEGIN;
--   DROP FUNCTION IF EXISTS gsg_conexiones_activas(text, int);
--   DROP FUNCTION IF EXISTS gsg_conexion_por_cuenta(text, text);
--   COMMIT;
