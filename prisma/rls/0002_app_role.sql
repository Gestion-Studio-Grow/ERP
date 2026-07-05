-- ============================================================================
-- 0002 — Rol de aplicación sin BYPASSRLS — ADR-018 (mecanismo B)
-- ============================================================================
-- El enforcement de RLS depende de que la app NO se conecte como owner de las
-- tablas (el owner las exime salvo FORCE). Este script crea `app_user`: un rol
-- de LOGIN, SIN BYPASSRLS, que NO es owner de nada, con solo los privilegios de
-- DML necesarios. Al rotar DATABASE_URL a este rol, las policies de 0001 pasan a
-- aplicarse a la app.
--
-- SECRETO FUERA DEL REPO: la contraseña NO se commitea. Se pasa al aplicar:
--   psql "$DATABASE_URL_OWNER" -v app_pw="$APP_USER_PASSWORD" -f 0002_app_role.sql
-- (psql interpola :'app_pw' de forma segura y con quoting correcto.)
--
-- En Neon el rol de conexión de la app suele ser `neondb_owner` (dueño de las
-- tablas). `app_user` es un rol DISTINTO, deliberadamente sin ownership.
-- ============================================================================

BEGIN;

-- Rol de la app: login, sin superuser, sin createrole, SIN bypassrls (default).
-- NOINHERIT no hace falta; lo importante es que NO herede un rol con BYPASSRLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- CRÍTICO — forzar los atributos aunque el rol YA exista (el CREATE de arriba se
-- saltea con IF NOT EXISTS). En prod se encontró un `app_user` PREEXISTENTE con
-- BYPASSRLS=true (2026-07-05): un rol así EVADE todas las policies → cero
-- aislamiento, en silencio. Este ALTER es idempotente y deja el rol correcto sí o
-- sí antes de rotarle DATABASE_URL. NUNCA quitar esta línea.
ALTER ROLE app_user WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Contraseña provista fuera del repo vía -v app_pw=...
ALTER ROLE app_user WITH PASSWORD :'app_pw';

-- Acceso al schema y a las tablas existentes (solo DML; nada de DDL/ownership).
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Que las tablas/secuencias creadas por FUTURAS migraciones (corridas por el
-- owner) hereden estos grants automáticamente, para no re-otorgar en cada deploy.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO app_user;

COMMIT;

-- Verificación rápida (debe devolver rolbypassrls = false):
--   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';
