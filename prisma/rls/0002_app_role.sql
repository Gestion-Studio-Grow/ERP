-- ============================================================================
-- 0002 — Rol de aplicación sin BYPASSRLS — ADR-018 (mecanismo B)
-- ============================================================================
-- El enforcement de RLS depende de que la app NO se conecte como owner de las
-- tablas (el owner las exime salvo FORCE). Este script crea `app_rls`: un rol de
-- LOGIN, SIN BYPASSRLS, que NO es owner de nada, con solo los privilegios de DML
-- necesarios. Al rotar DATABASE_URL a este rol, las policies de 0001 pasan a
-- aplicarse a la app.
--
-- ⚠️ POR QUÉ UN ROL NUEVO `app_rls` (y NO el viejo `app_user`) — hallazgo del
-- ensayo en branch de Neon (2026-07-05): prod tiene un `app_user` PREEXISTENTE con
-- BYPASSRLS=true, y quitarle el bypass es IMPOSIBLE para `neondb_owner`
-- (`ALTER ROLE app_user NOBYPASSRLS` → "permission denied"; requiere superuser, que
-- Neon no otorga). Un rol así EVADE todas las policies → cero aislamiento, en
-- silencio. La solución PROBADA EN VERDE (ensayo 8/8) es NO tocar `app_user` y
-- crear un rol LIMPIO `app_rls`: al crearse nuevo nace `NOBYPASSRLS` y `neondb_owner`
-- sí puede administrarlo. La app se conecta por el proxy de Neon con `app_rls`.
--
-- SECRETO FUERA DEL REPO: la contraseña NO se commitea. Se pasa al aplicar:
--   psql "$OPERATOR_DATABASE_URL" -v app_pw="$APP_RLS_PASSWORD" -f 0002_app_role.sql
-- (psql interpola :'app_pw' de forma segura y con quoting correcto.)
--
-- En Neon el rol de conexión del owner es `neondb_owner` (dueño de las tablas).
-- `app_rls` es un rol DISTINTO, deliberadamente sin ownership.
-- ============================================================================

BEGIN;

-- Rol de la app: login, sin superuser, sin createrole, SIN bypassrls (default).
-- NOINHERIT no hace falta; lo importante es que NO herede un rol con BYPASSRLS.
-- Al ser un rol NUEVO nace ya NOBYPASSRLS (evita el footgun del `app_user` de prod).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

-- CRÍTICO — forzar los atributos aunque el rol YA exista (el CREATE de arriba se
-- saltea con IF NOT EXISTS). Idempotente: re-correr deja el rol correcto sí o sí
-- antes de rotarle DATABASE_URL. `neondb_owner` PUEDE forzar estos atributos sobre
-- `app_rls` porque es un rol que él mismo creó (a diferencia del `app_user` heredado,
-- que necesita superuser). NUNCA quitar esta línea.
ALTER ROLE app_rls WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Contraseña provista fuera del repo vía -v app_pw=...
ALTER ROLE app_rls WITH PASSWORD :'app_pw';

-- Acceso al schema y a las tablas existentes (solo DML; nada de DDL/ownership).
GRANT USAGE ON SCHEMA public TO app_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_rls;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_rls;

-- Que las tablas/secuencias creadas por FUTURAS migraciones (corridas por el
-- owner) hereden estos grants automáticamente, para no re-otorgar en cada deploy.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO app_rls;
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO app_rls;

COMMIT;

-- Verificación rápida (debe devolver rolbypassrls = false):
--   SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_rls';
