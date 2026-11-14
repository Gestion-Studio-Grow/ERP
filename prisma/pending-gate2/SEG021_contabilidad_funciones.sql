-- ============================================================================
-- SEG021_contabilidad_funciones — endurecimiento de las funciones trigger de contabilidad
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño) · ADR-018
-- ============================================================================
--
-- QUÉ: re-crea las 4 funciones trigger de `20261104122000_contabilidad_ola1` con la MISMA lógica y
-- los MISMOS mensajes, y tres cambios de endurecimiento:
--   1. Las lecturas de otras filas (Asiento, AsientoLinea, Ejercicio) quedan acotadas al negocio de
--      la fila (`"tenantId" = NEW."tenantId"`, u OLD en DELETE y en la fila vieja de un UPDATE).
--   2. Los controles que corren ANTES de grabar (triggers BEFORE) exigen, si hay negocio vigente
--      (`app.current_tenant_id` puesto y no vacío), que la fila sea de ese negocio; si no, cortan
--      con un error genérico (42501) antes de leer nada. Sin negocio vigente (dueño, scripts) no
--      cambia nada. El cuadre diferido (AFTER, al COMMIT) no lleva este corte: la fila ya pasó la
--      policy al grabarse.
--   3. `REVOKE EXECUTE ... FROM PUBLIC`: mínimo privilegio; son funciones SECURITY DEFINER que sólo
--      se usan como trigger. El gestor de triggers no verifica EXECUTE del rol que escribe, así que
--      los controles siguen disparando para `app_rls` (lo prueba
--      src/lib/contabilidad-funciones-permisos-postgres.test.ts).
--   Para filas del negocio vigente el resultado es el mismo que en la ola 1.
--
-- POR QUÉ: hallazgo SEG-021 (auditoría de permisos de funciones). Mínimo privilegio y lecturas
-- acotadas al negocio de la fila y al negocio vigente.
--
-- La validación en sí no depende de `app.current_tenant_id` (ver el comentario de la ola 1: el
-- cuadre diferido corre con el negocio vigente al COMMIT); el negocio sale de la fila misma.
--
-- Dueño: el de las tablas (`neondb_owner`), como en la ola 1. CREATE OR REPLACE conserva dueño y
-- permisos; el bloque DO sólo lo deja explícito. Si el archivo lo corriera un rol que no es el
-- dueño, el primer CREATE OR REPLACE ya falla y la transacción revierte entera.
--
-- ADITIVA · IDEMPOTENTE (CREATE OR REPLACE + REVOKE) · una transacción. No toca datos ni triggers.
-- Correr como el dueño de las funciones (MIGRATE_DATABASE_URL). Reversa al pie.
-- ============================================================================

BEGIN;

-- Un asiento CONFIRMADO cuadra: ≥ 2 líneas, Σ debe = Σ haber, total > 0 (diferido al COMMIT).
CREATE OR REPLACE FUNCTION contabilidad_controlar_cuadre() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_asiento TEXT;
  v_tenant TEXT;
  v_estado TEXT;
  v_n INTEGER;
  v_debe NUMERIC;
  v_haber NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'Asiento' THEN
    v_asiento := NEW."id";
    v_tenant := NEW."tenantId";
  ELSIF TG_OP = 'DELETE' THEN
    v_asiento := OLD."asientoId";
    v_tenant := OLD."tenantId";
  ELSE
    v_asiento := NEW."asientoId";
    v_tenant := NEW."tenantId";
  END IF;
  SELECT "estado" INTO v_estado FROM "Asiento"
    WHERE "id" = v_asiento AND "tenantId" = v_tenant FOR SHARE;
  IF v_estado IS DISTINCT FROM 'CONFIRMADO' THEN
    RETURN NULL;
  END IF;
  SELECT COUNT(*), COALESCE(SUM("debe"), 0), COALESCE(SUM("haber"), 0)
    INTO v_n, v_debe, v_haber
    FROM "AsientoLinea" WHERE "asientoId" = v_asiento AND "tenantId" = v_tenant;
  IF v_n < 2 OR v_debe <> v_haber OR v_debe = 0 THEN
    RAISE EXCEPTION 'Asiento % descuadrado: % líneas, debe %, haber %', v_asiento, v_n, v_debe, v_haber
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

-- Un asiento CONFIRMADO no se edita ni se borra (se contra-asienta), y sus líneas tampoco.
-- Si un UPDATE cambia el negocio de la línea, la fila vieja se controla también (como al cambiar
-- de asiento): el resultado para el negocio dueño de la línea es el mismo que antes.
CREATE OR REPLACE FUNCTION contabilidad_asiento_inmutable() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_estado TEXT;
  v_vigente TEXT := NULLIF(current_setting('app.current_tenant_id', true), '');
BEGIN
  IF v_vigente IS NOT NULL THEN
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW."tenantId" IS DISTINCT FROM v_vigente THEN
      RAISE EXCEPTION 'El registro no pertenece al negocio vigente' USING ERRCODE = '42501';
    END IF;
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD."tenantId" IS DISTINCT FROM v_vigente THEN
      RAISE EXCEPTION 'El registro no pertenece al negocio vigente' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'Asiento' THEN
    IF OLD."estado" = 'CONFIRMADO' THEN
      RAISE EXCEPTION 'El asiento % está confirmado: no se edita ni se borra, se contra-asienta', OLD."id"
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT "estado" INTO v_estado FROM "Asiento"
      WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."asientoId" ELSE NEW."asientoId" END
        AND "tenantId" = CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantId" ELSE NEW."tenantId" END
      FOR SHARE;
    IF v_estado = 'CONFIRMADO' THEN
      RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD."asientoId" <> NEW."asientoId" OR OLD."tenantId" <> NEW."tenantId") THEN
      SELECT "estado" INTO v_estado FROM "Asiento"
        WHERE "id" = OLD."asientoId" AND "tenantId" = OLD."tenantId" FOR SHARE;
      IF v_estado = 'CONFIRMADO' THEN
        RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Todo asiento que se escribe cae en un ejercicio ABIERTO del mismo negocio y con la fecha adentro.
CREATE OR REPLACE FUNCTION contabilidad_asiento_en_ejercicio() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ej RECORD;
  v_vigente TEXT := NULLIF(current_setting('app.current_tenant_id', true), '');
BEGIN
  IF v_vigente IS NOT NULL THEN
    IF NEW."tenantId" IS DISTINCT FROM v_vigente THEN
      RAISE EXCEPTION 'El registro no pertenece al negocio vigente' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."tenantId" IS DISTINCT FROM v_vigente THEN
      RAISE EXCEPTION 'El registro no pertenece al negocio vigente' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT "tenantId", "estado", "fechaInicio", "fechaCierre" INTO v_ej
    FROM "Ejercicio" WHERE "id" = NEW."ejercicioId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF NOT FOUND OR v_ej."tenantId" <> NEW."tenantId" THEN
    RAISE EXCEPTION 'El asiento % no tiene un ejercicio válido', NEW."id" USING ERRCODE = '23514';
  END IF;
  IF v_ej."estado" <> 'ABIERTO' THEN
    RAISE EXCEPTION 'El ejercicio del asiento % está cerrado', NEW."id" USING ERRCODE = '23514';
  END IF;
  IF NEW."fecha" < v_ej."fechaInicio" OR NEW."fecha" > v_ej."fechaCierre" THEN
    RAISE EXCEPTION 'La fecha % del asiento % queda fuera de su ejercicio (% a %)',
      NEW."fecha", NEW."id", v_ej."fechaInicio", v_ej."fechaCierre" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- Un ejercicio con borradores no se cierra, y no se le achican las fechas dejando asientos afuera.
-- Los asientos se buscan en el negocio de la fila vieja (BEFORE UPDATE: todavía no cambió).
CREATE OR REPLACE FUNCTION contabilidad_controlar_ejercicio() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_vigente TEXT := NULLIF(current_setting('app.current_tenant_id', true), '');
BEGIN
  IF v_vigente IS NOT NULL
     AND (OLD."tenantId" IS DISTINCT FROM v_vigente OR NEW."tenantId" IS DISTINCT FROM v_vigente) THEN
    RAISE EXCEPTION 'El registro no pertenece al negocio vigente' USING ERRCODE = '42501';
  END IF;
  IF NEW."estado" = 'CERRADO' AND OLD."estado" <> 'CERRADO'
     AND EXISTS (SELECT 1 FROM "Asiento" WHERE "ejercicioId" = OLD."id" AND "tenantId" = OLD."tenantId"
                 AND "estado" = 'BORRADOR') THEN
    RAISE EXCEPTION 'El ejercicio % tiene asientos en borrador: confirmalos o borralos antes de cerrarlo', OLD."id"
      USING ERRCODE = '23514';
  END IF;
  IF (NEW."fechaInicio" > OLD."fechaInicio" OR NEW."fechaCierre" < OLD."fechaCierre")
     AND EXISTS (SELECT 1 FROM "Asiento" WHERE "ejercicioId" = OLD."id" AND "tenantId" = OLD."tenantId"
                 AND ("fecha" < NEW."fechaInicio" OR "fecha" > NEW."fechaCierre")) THEN
    RAISE EXCEPTION 'El ejercicio % tiene asientos fuera de las fechas nuevas', OLD."id" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- Dueño explícito: el de las tablas (como en la ola 1).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    ALTER FUNCTION contabilidad_controlar_cuadre() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_asiento_inmutable() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_asiento_en_ejercicio() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_controlar_ejercicio() OWNER TO neondb_owner;
  END IF;
END $$;

-- Sólo como trigger: nadie las llama directo. Los triggers siguen disparando sin EXECUTE.
REVOKE EXECUTE ON FUNCTION contabilidad_controlar_cuadre() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_asiento_inmutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_asiento_en_ejercicio() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_controlar_ejercicio() FROM PUBLIC;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA (sin pérdida de datos: no hay datos), como el dueño:
--   1. Re-ejecutar, en una transacción, el tramo de funciones de
--      prisma/migrations/20261104122000_contabilidad_ola1/migration.sql: los 4
--      `CREATE OR REPLACE FUNCTION contabilidad_*` y el bloque DO de dueño (NO los CREATE TRIGGER,
--      que ya existen y no cambian).
--   2. Devolver el permiso por defecto:
--   BEGIN;
--   GRANT EXECUTE ON FUNCTION contabilidad_controlar_cuadre() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION contabilidad_asiento_inmutable() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION contabilidad_asiento_en_ejercicio() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION contabilidad_controlar_ejercicio() TO PUBLIC;
--   COMMIT;
