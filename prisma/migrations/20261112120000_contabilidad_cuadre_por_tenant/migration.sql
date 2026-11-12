-- Contabilidad · cuadre por negocio (panel SAP 4, gap 1 · trampa 1).
--
-- ADITIVA: sólo `CREATE OR REPLACE FUNCTION` de `contabilidad_controlar_cuadre()`. No toca tablas,
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
