-- Contabilidad · cuadre por negocio (panel SAP 4, gap 1 · trampa 1).
--
-- ADITIVA: sólo funciones (`contabilidad_controlar_cuadre()`, más el endurecimiento de abajo) y permisos
-- de EXECUTE. No toca tablas,
-- datos, índices ni los triggers (siguen apuntando a la misma función por nombre). Escrita SIN
-- aplicar (Gate 2). Si no se aplica, el código no cambia de comportamiento: sigue la versión de
-- 20261104122000_contabilidad_ola1, que es correcta pero lenta con muchos renglones de otros negocios.
--
-- Qué cambia: la suma del trigger filtraba sólo por "asientoId". El índice de renglones es
-- ("tenantId", "asientoId"): sin la primera columna, Postgres recorre el índice entero (todos los
-- negocios) en cada disparo. Medido con 5 M de renglones: 312 ms → 2 ms (4 líneas), 10,2 s → 8 ms
-- (200 líneas). El "tenantId" se toma de la cabecera del asiento (la misma lectura FOR SHARE que ya
-- había), no de `app.current_tenant_id`: la función sigue sin depender del negocio vigente al COMMIT.
-- La FK compuesta (asientoId, tenantId) → Asiento(id, tenantId) garantiza que todos los renglones del
-- asiento tienen ese "tenantId": el filtro no deja ninguno afuera, la regla de cuadre es la misma.
--
-- Endurecimiento (certificación C1, vuelta 2): las funciones SECURITY DEFINER corren como el dueño de
-- las tablas y Postgres les da EXECUTE a PUBLIC. `app_rls` podía crear una tabla TEMP con un trigger que
-- las llamara con la fila que quisiera (de otro negocio). Tres capas:
--   1. `REVOKE EXECUTE ... FROM PUBLIC` (abajo, y 0002 lo repite). Los triggers legítimos siguen andando:
--      Postgres controla EXECUTE al CREAR el trigger (lo crea el dueño), no al dispararlo.
--   2. `contabilidad_exigir_tabla`: cada función de trigger rechaza (42501) una tabla que no sea la suya
--      en el schema public (una TEMP con el mismo nombre vive en pg_temp_N).
--   3. `contabilidad_exigir_negocio`: en los triggers BEFORE que traban o leen con el "tenantId" de la
--      fila nueva, ese negocio tiene que ser el de la sesión ANTES de usarlo. La WITH CHECK de RLS corre
--      DESPUÉS de los BEFORE: rechazaría la fila, pero tarde (la traba tomada duraría hasta el ROLLBACK).
--      Sólo restringe a sesiones sujetas a RLS (no al dueño, ni a superusuario o BYPASSRLS).
--      NO es una frontera nueva: con SQL libre, `app_rls` puede cambiar `app.current_tenant_id` dentro de
--      su transacción (modelo RLS de ADR-018). La frontera real es que la app sólo fija el negocio con
--      `tenantTransaction`; esta guarda adelanta lo que haría la WITH CHECK, nada más.
-- También cambia `contabilidad_asiento_inmutable()` (ola 1): esas dos guardas, y la cabecera se busca
-- por ("id", "tenantId") de la fila.

-- Guarda 2. INVOKER: corre con el rol de la función de trigger que la llama (el dueño).
CREATE OR REPLACE FUNCTION contabilidad_exigir_tabla(p_schema name, p_tabla name, p_esperadas text[]) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_schema IS DISTINCT FROM 'public' OR NOT (p_tabla = ANY (p_esperadas)) THEN
    RAISE EXCEPTION 'Función de contabilidad disparada desde %.%: sólo corre en sus tablas', p_schema, p_tabla
      USING ERRCODE = '42501';
  END IF;
END $$;

-- Guarda 3. `session_user` es el rol de la conexión aunque la función sea SECURITY DEFINER.
CREATE OR REPLACE FUNCTION contabilidad_exigir_negocio(p_tabla regclass, p_tenant text) RETURNS void
  LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_tenant IS DISTINCT FROM current_setting('app.current_tenant_id', true)
     AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = session_user AND (r.rolsuper OR r.rolbypassrls))
     AND NOT pg_has_role(session_user, (SELECT c.relowner FROM pg_class c WHERE c.oid = p_tabla), 'USAGE') THEN
    RAISE EXCEPTION 'La fila de % es de otro negocio que el de la sesión', p_tabla USING ERRCODE = '42501';
  END IF;
END $$;

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
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['Asiento', 'AsientoLinea']);
  IF TG_TABLE_NAME = 'Asiento' THEN
    v_asiento := NEW."id";
  ELSIF TG_OP = 'DELETE' THEN
    v_asiento := OLD."asientoId";
  ELSE
    v_asiento := NEW."asientoId";
  END IF;
  SELECT "estado", "tenantId" INTO v_estado, v_tenant FROM "Asiento" WHERE "id" = v_asiento FOR SHARE;
  IF v_estado IS DISTINCT FROM 'CONFIRMADO' THEN
    RETURN NULL;
  END IF;
  SELECT COUNT(*), COALESCE(SUM("debe"), 0), COALESCE(SUM("haber"), 0)
    INTO v_n, v_debe, v_haber
    FROM "AsientoLinea" WHERE "tenantId" = v_tenant AND "asientoId" = v_asiento;
  IF v_n < 2 OR v_debe <> v_haber OR v_debe = 0 THEN
    RAISE EXCEPTION 'Asiento % descuadrado: % líneas, debe %, haber %', v_asiento, v_n, v_debe, v_haber
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

-- Ola 1 `:249` con las guardas 2 y 3, y la cabecera buscada por ("id", "tenantId") de la línea: ya no
-- se traba (FOR SHARE) un asiento de otro negocio con una línea que lo nombre.
CREATE OR REPLACE FUNCTION contabilidad_asiento_inmutable() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_estado TEXT;
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['Asiento', 'AsientoLinea']);
  IF TG_TABLE_NAME = 'Asiento' THEN
    IF OLD."estado" = 'CONFIRMADO' THEN
      RAISE EXCEPTION 'El asiento % está confirmado: no se edita ni se borra, se contra-asienta', OLD."id"
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN
      PERFORM contabilidad_exigir_negocio(TG_RELID, NEW."tenantId");
    END IF;
    SELECT "estado" INTO v_estado FROM "Asiento"
      WHERE ("id", "tenantId") = (CASE WHEN TG_OP = 'DELETE' THEN OLD."asientoId" ELSE NEW."asientoId" END,
                                  CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantId" ELSE NEW."tenantId" END)
      FOR SHARE;
    IF v_estado = 'CONFIRMADO' THEN
      RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD."asientoId", OLD."tenantId") IS DISTINCT FROM (NEW."asientoId", NEW."tenantId") THEN
      SELECT "estado" INTO v_estado FROM "Asiento" WHERE ("id", "tenantId") = (OLD."asientoId", OLD."tenantId") FOR SHARE;
      IF v_estado = 'CONFIRMADO' THEN
        RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    ALTER FUNCTION contabilidad_controlar_cuadre() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_asiento_inmutable() OWNER TO neondb_owner;
  END IF;
END $$;

-- Guarda 1: sin EXECUTE para PUBLIC en las SECURITY DEFINER de la ola 1. No se usa ALTER DEFAULT
-- PRIVILEGES: le quitaría EXECUTE a toda función futura del repo, no sólo a éstas.
REVOKE EXECUTE ON FUNCTION contabilidad_controlar_cuadre() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_asiento_inmutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_asiento_en_ejercicio() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_controlar_ejercicio() FROM PUBLIC;
