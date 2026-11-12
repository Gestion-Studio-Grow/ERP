-- Contabilidad · capa de PARAMETRIZACIÓN, parte A (R2, panel SAP: R2-diseno-parametrizacion.md §2 y §4).
--
-- ADITIVA: CREATE TABLE, ADD COLUMN (nullable o con default constante, sin reescribir la tabla),
-- CREATE INDEX, CHECK sobre columnas NUEVAS, CREATE OR REPLACE FUNCTION y CREATE TRIGGER nuevos.
-- No hay DROP de tablas ni columnas, ni ALTER de columnas existentes. Escrita SIN aplicar (Gate 2).
-- Requiere 20261104122000_contabilidad_ola1, 20261108150000_contabilidad_ola2_roles y
-- 20261112120000_contabilidad_cuadre_por_tenant. Va junto con 20261112130100_contabilidad_param_b.
--
-- INERTE mientras `ConfigContable.parametrizacion IS NULL` (todos los negocios hoy): los triggers de
-- asiento sólo hacen lo que ya hacían (ola 1 + cuadre por negocio), y el rastro no anota cambios de
-- las tablas que ya existían (ConfigContable, CuentaContable, CuentaRol). Con `V1` la base exige los
-- parámetros y rechaza (23514) nombrando el nodo que falta: nunca cuenta por defecto ni «sin fila =
-- abierto» (regla 3 del diseño).
--
-- Esta parte: S2 (columnas de moneda, clase, foto y actor en Asiento/AsientoLinea), PeriodoApertura,
-- NumeradorContable, ClaseAsiento, CentroCosto, ParamCambio, columnas nuevas de ConfigContable y
-- CuentaContable; amplía `contabilidad_asiento_en_ejercicio` (período por clase, clase de asiento,
-- centro de costo, número que pone la base) y `contabilidad_controlar_cuadre` (conversión), y filtra
-- por negocio `contabilidad_controlar_ejercicio`. Estado de campos y conversión se completan en la
-- parte B: acá quedan como funciones que RECHAZAN si se las llama (capa prendida sin la parte B).
--
-- Decisiones PROVISIONALES A CONFIRMAR (dueño / contador):
--   · un correlativo por ejercicio (numerador DIARIO), con rangos disponibles para otros numeradores;
--   · períodos: un rango abierto por clase de cuenta (GENERAL + la de cada clase; clase sin fila usa GENERAL);
--   · centro de costo obligatorio en cuentas de resultado sólo si el negocio lo marca (clase de asiento
--     `exigeCentroCosto` o grupo de campos `R`).
--   · actor: se lee de `app.current_actor` (lo cablea C2 en `enTransaccion`). Mientras la capa está
--     apagada se tolera NULL; con `V1`, cambio de parámetro sin actor → rechazo.
--
-- Permisos de `app_rls` (no dependen de pg_trigger_depth(), que la app falsea con un trigger TEMP):
--   · "ParamCambio": sólo SELECT. Lo escribe `contabilidad_param_rastro` (SECURITY DEFINER, como dueño).
--   · "NumeradorContable": SELECT, INSERT, DELETE y UPDATE sólo de "desde", "hasta", "updatedAt";
--     "ultimo" lo mueve únicamente `contabilidad_param_al_confirmar` (SECURITY DEFINER).
--   0002_app_role.sql repite este recorte (re-correrlo re-otorga todo).
--
-- Concurrencia (orden de trabas, igual en todos los caminos):
--   · la fila GENERAL de "PeriodoApertura" del negocio es el candado de la capa: confirmar la toma
--     FOR NO KEY UPDATE ANTES que cualquier otra traba de la capa y la tiene hasta el COMMIT; toda
--     escritura en "PeriodoApertura" (cerrar, abrir, crear o borrar la fila de una clase) la toma
--     primero (`contabilidad_param_periodo` le escribe "updatedAt"). Así el cierre espera al asiento
--     en vuelo, confirmar+cerrar en la misma transacción no se traba con otra confirmación, y una
--     confirmación en REPEATABLE READ / SERIALIZABLE con foto anterior al cierre recibe 40001.
--   · los rangos de numerador se escriben sólo en READ COMMITTED (con otra foto no se ven los rangos
--     que otra transacción ya guardó): en REPEATABLE READ o SERIALIZABLE se rechaza (23514).
--   · resto conocido: cambiar OTRO parámetro (clase de asiento, rango de numerador) y confirmar en la
--     misma transacción, contra otra confirmación, puede terminar en 40P01 (rechazo limpio, se
--     reintenta). Hoy ningún flujo de la app hace eso.
--
-- DEUDA (operativa, anotada en la certificación de C1): un negocio con filas en "ParamCambio" ya no se
-- puede borrar (FK RESTRICT a "Tenant" + rastro sólo-agregar). Borrarlo exige un procedimiento del
-- dueño de la base (deshabilitar el trigger del rastro en una ventana controlada). Provisional a confirmar.

-- ── ConfigContable y CuentaContable (ampliar) ──────────────────────────────────────────────────

ALTER TABLE "ConfigContable" ADD COLUMN "monedaFuncional" TEXT NOT NULL DEFAULT 'ARS',
ADD COLUMN "parametrizacion" TEXT,
ADD COLUMN "cuatroOjos" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_monedaFuncional_check"
  CHECK ("monedaFuncional" ~ '^[A-Z]{3}$');
ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_parametrizacion_check"
  CHECK ("parametrizacion" IS NULL OR "parametrizacion" IN ('V1'));

ALTER TABLE "CuentaContable" ADD COLUMN "claseCuenta" TEXT;
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_claseCuenta_check"
  CHECK ("claseCuenta" IS NULL OR "claseCuenta" IN ('MAYOR', 'CLIENTES', 'PROVEEDORES', 'BANCOS', 'IMPUESTOS'));

-- ── S2: Asiento y AsientoLinea (columnas nuevas, todas NULL; ADD COLUMN no dispara triggers) ────

ALTER TABLE "Asiento" ADD COLUMN "claseAsientoId" TEXT,
ADD COLUMN "claveOrigen" TEXT,
ADD COLUMN "moneda" TEXT,
ADD COLUMN "tipoCotizacionCodigo" TEXT,
ADD COLUMN "cotizacion" BIGINT,
ADD COLUMN "fechaCotizacion" DATE,
ADD COLUMN "fechaComprobante" DATE,
ADD COLUMN "referencia" TEXT,
ADD COLUMN "creadoPor" TEXT,
ADD COLUMN "confirmadoPor" TEXT,
ADD COLUMN "confirmadoEn" TIMESTAMP(3);

ALTER TABLE "AsientoLinea" ADD COLUMN "moneda" TEXT,
ADD COLUMN "importeOrigen" BIGINT,
ADD COLUMN "cotizacion" BIGINT,
ADD COLUMN "centroCostoId" TEXT,
ADD COLUMN "indicadorImpuestoId" TEXT,
ADD COLUMN "regimenRetencionId" TEXT;

-- Cotización: pesos por unidad con 6 decimales enteros (1.234,567891 → 1234567891).
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_moneda_check"
  CHECK ("moneda" IS NULL OR "moneda" ~ '^[A-Z]{3}$');
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_tipoCotizacionCodigo_check"
  CHECK ("tipoCotizacionCodigo" IS NULL OR "tipoCotizacionCodigo" IN ('BNA_VEND_DIVISA', 'BNA_COMP_DIVISA', 'MEP', 'PACTADA'));
-- La foto de la cotización de cabecera va completa o no va.
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_cotizacion_check"
  CHECK (("cotizacion" IS NULL OR "cotizacion" > 0)
     AND ("cotizacion" IS NULL) = ("tipoCotizacionCodigo" IS NULL)
     AND ("cotizacion" IS NULL) = ("fechaCotizacion" IS NULL));
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_claveOrigen_check"
  CHECK ("claveOrigen" IS NULL OR length(btrim("claveOrigen")) > 0);
-- G1: un reintento no duplica el asiento automático (único parcial: Prisma no lo expresa).
CREATE UNIQUE INDEX "Asiento_tenantId_claveOrigen_key" ON "Asiento"("tenantId", "claveOrigen") WHERE "claveOrigen" IS NOT NULL;

-- Los tres campos de moneda de la línea van juntos o ninguno; el lado lo dan debe/haber.
ALTER TABLE "AsientoLinea" ADD CONSTRAINT "AsientoLinea_moneda_check"
  CHECK (("moneda" IS NULL OR "moneda" ~ '^[A-Z]{3}$')
     AND ("moneda" IS NULL) = ("importeOrigen" IS NULL)
     AND ("moneda" IS NULL) = ("cotizacion" IS NULL)
     AND ("importeOrigen" IS NULL OR "importeOrigen" > 0)
     AND ("cotizacion" IS NULL OR "cotizacion" > 0));

-- ── Tablas nuevas ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE "PeriodoApertura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claseCuenta" TEXT NOT NULL,
    "abiertoDesde" DATE NOT NULL,
    "abiertoHasta" DATE NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodoApertura_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PeriodoApertura_claseCuenta_check"
      CHECK ("claseCuenta" IN ('GENERAL', 'MAYOR', 'CLIENTES', 'PROVEEDORES', 'BANCOS', 'IMPUESTOS')),
    CONSTRAINT "PeriodoApertura_rango_check" CHECK ("abiertoHasta" >= "abiertoDesde")
);

CREATE TABLE "NumeradorContable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ejercicioId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "desde" INTEGER NOT NULL,
    "hasta" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NumeradorContable_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NumeradorContable_codigo_check" CHECK ("codigo" ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT "NumeradorContable_rango_check"
      CHECK ("desde" >= 1 AND "hasta" >= "desde" AND "ultimo" >= "desde" - 1 AND "ultimo" <= "hasta")
);

CREATE TABLE "ClaseAsiento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "origenTipo" TEXT,
    "numeradorCodigo" TEXT,
    "permiteManual" BOOLEAN NOT NULL DEFAULT false,
    "clasesCuentaPermitidas" TEXT[] NOT NULL DEFAULT ARRAY['MAYOR', 'CLIENTES', 'PROVEEDORES', 'BANCOS', 'IMPUESTOS']::TEXT[],
    "claseAnulacionId" TEXT,
    "exigeReferencia" BOOLEAN NOT NULL DEFAULT false,
    "exigeCentroCosto" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaseAsiento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClaseAsiento_codigo_check"
      CHECK ("codigo" IN ('MAN', 'FAC', 'COB', 'PAG', 'APE', 'CIE', 'REF', 'ANU', 'REV')),
    CONSTRAINT "ClaseAsiento_origenTipo_check"
      CHECK ("origenTipo" IS NULL OR "origenTipo" IN ('MANUAL', 'FACTURA', 'COBRO', 'PAGO', 'APERTURA', 'CIERRE', 'REFUNDICION', 'AJUSTE')),
    CONSTRAINT "ClaseAsiento_numeradorCodigo_check"
      CHECK ("numeradorCodigo" IS NULL OR "numeradorCodigo" ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT "ClaseAsiento_clasesCuentaPermitidas_check"
      CHECK (cardinality("clasesCuentaPermitidas") >= 1
         AND "clasesCuentaPermitidas" <@ ARRAY['MAYOR', 'CLIENTES', 'PROVEEDORES', 'BANCOS', 'IMPUESTOS']::TEXT[])
);

CREATE TABLE "CentroCosto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "proyectoId" TEXT,
    "padreId" TEXT,
    "vigenteDesde" DATE NOT NULL,
    "vigenteHasta" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroCosto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CentroCosto_tipo_check" CHECK ("tipo" IN ('AREA', 'PROYECTO')),
    -- Una sola dimensión: el objeto de costo de un centro PROYECTO es el proyecto.
    CONSTRAINT "CentroCosto_proyecto_check" CHECK (("tipo" = 'PROYECTO') = ("proyectoId" IS NOT NULL)),
    CONSTRAINT "CentroCosto_vigencia_check" CHECK ("vigenteHasta" IS NULL OR "vigenteHasta" >= "vigenteDesde")
);

-- Rastro sólo-agregar de todo cambio de parámetros (lo escribe un trigger, nunca la app).
CREATE TABLE "ParamCambio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tabla" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "operacion" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "actor" TEXT,
    "motivo" TEXT,
    "en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParamCambio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ParamCambio_operacion_check" CHECK ("operacion" IN ('INSERT', 'UPDATE', 'DELETE'))
);

-- ── Índices ─────────────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "PeriodoApertura_tenantId_claseCuenta_key" ON "PeriodoApertura"("tenantId", "claseCuenta");
CREATE UNIQUE INDEX "PeriodoApertura_id_tenantId_key" ON "PeriodoApertura"("id", "tenantId");

CREATE UNIQUE INDEX "NumeradorContable_tenantId_ejercicioId_codigo_key" ON "NumeradorContable"("tenantId", "ejercicioId", "codigo");
CREATE UNIQUE INDEX "NumeradorContable_id_tenantId_key" ON "NumeradorContable"("id", "tenantId");

CREATE UNIQUE INDEX "ClaseAsiento_tenantId_codigo_key" ON "ClaseAsiento"("tenantId", "codigo");
CREATE UNIQUE INDEX "ClaseAsiento_id_tenantId_key" ON "ClaseAsiento"("id", "tenantId");

CREATE UNIQUE INDEX "CentroCosto_tenantId_codigo_key" ON "CentroCosto"("tenantId", "codigo");
CREATE UNIQUE INDEX "CentroCosto_id_tenantId_key" ON "CentroCosto"("id", "tenantId");
CREATE INDEX "CentroCosto_tenantId_proyectoId_idx" ON "CentroCosto"("tenantId", "proyectoId");

CREATE INDEX "ParamCambio_tenantId_tabla_registroId_idx" ON "ParamCambio"("tenantId", "tabla", "registroId");
CREATE INDEX "ParamCambio_tenantId_en_idx" ON "ParamCambio"("tenantId", "en");

CREATE INDEX "Asiento_tenantId_claseAsientoId_idx" ON "Asiento"("tenantId", "claseAsientoId");
CREATE INDEX "AsientoLinea_tenantId_centroCostoId_idx" ON "AsientoLinea"("tenantId", "centroCostoId");

-- ── FK: todas compuestas con "tenantId" (no cruzan de negocio aunque se chequeen sin RLS) ───────

ALTER TABLE "PeriodoApertura" ADD CONSTRAINT "PeriodoApertura_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NumeradorContable" ADD CONSTRAINT "NumeradorContable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NumeradorContable" ADD CONSTRAINT "NumeradorContable_ejercicioId_tenantId_fkey" FOREIGN KEY ("ejercicioId", "tenantId") REFERENCES "Ejercicio"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaseAsiento" ADD CONSTRAINT "ClaseAsiento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClaseAsiento" ADD CONSTRAINT "ClaseAsiento_claseAnulacionId_tenantId_fkey" FOREIGN KEY ("claseAnulacionId", "tenantId") REFERENCES "ClaseAsiento"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CentroCosto" ADD CONSTRAINT "CentroCosto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CentroCosto" ADD CONSTRAINT "CentroCosto_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CentroCosto" ADD CONSTRAINT "CentroCosto_padreId_tenantId_fkey" FOREIGN KEY ("padreId", "tenantId") REFERENCES "CentroCosto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ParamCambio" ADD CONSTRAINT "ParamCambio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_claseAsientoId_tenantId_fkey" FOREIGN KEY ("claseAsientoId", "tenantId") REFERENCES "ClaseAsiento"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AsientoLinea" ADD CONSTRAINT "AsientoLinea_centroCostoId_tenantId_fkey" FOREIGN KEY ("centroCostoId", "tenantId") REFERENCES "CentroCosto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Funciones de la capa ────────────────────────────────────────────────────────────────────────
-- Como en la ola 1: SECURITY DEFINER con search_path fijo, corren como el dueño de las tablas y
-- toman el "tenantId" de la fila (cabecera del asiento), nunca de `app.current_tenant_id`.

-- ¿Está prendida la capa para este negocio? Sin fila de ConfigContable = apagada (modo actual).
CREATE OR REPLACE FUNCTION contabilidad_param_activa(p_tenant TEXT) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT "parametrizacion" = 'V1' FROM "ConfigContable" WHERE "tenantId" = p_tenant), false)
$$;

-- Quién hace el cambio. Hoy nadie fija `app.current_actor` (lo cablea C2): NULL se tolera con la capa apagada.
CREATE OR REPLACE FUNCTION contabilidad_param_actor() RETURNS text
  LANGUAGE sql STABLE AS $$
  SELECT NULLIF(btrim(current_setting('app.current_actor', true)), '')
$$;

-- Rastro: una fila en ParamCambio por cada INSERT/UPDATE/DELETE de un parámetro.
--   · tablas nuevas de la capa: siempre;
--   · ConfigContable, CuentaContable, CuentaRol (ya existían): sólo con la capa prendida (o si el
--     cambio toca `parametrizacion`), para no alterar a los negocios que no la usan;
--   · con la capa prendida, sin actor → rechazo;
--   · el avance del numerador que hace la base al confirmar no se anota (sería una fila por asiento).
CREATE OR REPLACE FUNCTION contabilidad_param_rastro() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_antes jsonb;
  v_despues jsonb;
  v_tenant text;
  v_activa boolean;
  v_actor text := contabilidad_param_actor();
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['ConfigContable', 'CuentaContable', 'CuentaRol', 'PeriodoApertura', 'NumeradorContable', 'ClaseAsiento',
    'CentroCosto', 'TipoCotizacion', 'Cotizacion', 'IndicadorImpuesto', 'RegimenRetencion', 'DeterminacionCuenta', 'Tolerancia',
    'GrupoCampos']);
  IF TG_OP <> 'INSERT' THEN v_antes := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_despues := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' AND (v_antes - 'updatedAt') = (v_despues - 'updatedAt') THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'NumeradorContable' AND TG_OP = 'UPDATE' AND pg_trigger_depth() > 1
     AND (v_antes - 'ultimo' - 'updatedAt') = (v_despues - 'ultimo' - 'updatedAt') THEN
    RETURN NULL;
  END IF;
  v_tenant := COALESCE(v_despues->>'tenantId', v_antes->>'tenantId');
  v_activa := contabilidad_param_activa(v_tenant);
  IF TG_TABLE_NAME = 'ConfigContable' THEN
    v_activa := v_activa OR (v_antes->>'parametrizacion') IS NOT NULL OR (v_despues->>'parametrizacion') IS NOT NULL;
  END IF;
  IF TG_TABLE_NAME IN ('ConfigContable', 'CuentaContable', 'CuentaRol') AND NOT v_activa THEN
    RETURN NULL;
  END IF;
  IF v_activa AND v_actor IS NULL THEN
    RAISE EXCEPTION 'Cambio de parametrización contable (%) sin actor: falta app.current_actor', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO "ParamCambio" ("id", "tenantId", "tabla", "registroId", "operacion", "antes", "despues", "actor", "motivo")
  VALUES (gen_random_uuid()::text, v_tenant, TG_TABLE_NAME,
          COALESCE(v_despues->>'id', v_antes->>'id', v_tenant), TG_OP, v_antes, v_despues, v_actor,
          NULLIF(btrim(current_setting('app.current_motivo', true)), ''));
  RETURN NULL;
END $$;

-- El rastro es sólo-agregar y sólo lo escribe el trigger de arriba (profundidad de trigger ≥ 2).
CREATE OR REPLACE FUNCTION contabilidad_param_rastro_inmutable() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['ParamCambio', 'Cotizacion']);
  IF TG_OP = 'INSERT' AND pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El rastro de parametrización es sólo-agregar y lo escribe la base (%)', TG_OP
    USING ERRCODE = '23514';
END $$;

CREATE TRIGGER "ParamCambio_inmutable" BEFORE INSERT OR UPDATE OR DELETE ON "ParamCambio"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro_inmutable();
CREATE TRIGGER "ParamCambio_sin_truncate" BEFORE TRUNCATE ON "ParamCambio"
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad_param_rastro_inmutable();

CREATE TRIGGER "ConfigContable_rastro" AFTER INSERT OR UPDATE OR DELETE ON "ConfigContable"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "CuentaContable_rastro" AFTER INSERT OR UPDATE OR DELETE ON "CuentaContable"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "CuentaRol_rastro" AFTER INSERT OR UPDATE OR DELETE ON "CuentaRol"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "PeriodoApertura_rastro" AFTER INSERT OR UPDATE OR DELETE ON "PeriodoApertura"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "NumeradorContable_rastro" AFTER INSERT OR UPDATE OR DELETE ON "NumeradorContable"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "ClaseAsiento_rastro" AFTER INSERT OR UPDATE OR DELETE ON "ClaseAsiento"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "CentroCosto_rastro" AFTER INSERT OR UPDATE OR DELETE ON "CentroCosto"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();

-- Con la capa prendida, `tipo`, `monedaCuenta` y `claseCuenta` de una cuenta con líneas confirmadas
-- no cambian (cambiarlos reclasificaría lo contabilizado).
CREATE OR REPLACE FUNCTION contabilidad_param_cuenta_estable() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['CuentaContable']);
  IF (NEW."tipo", NEW."monedaCuenta", NEW."claseCuenta") IS DISTINCT FROM (OLD."tipo", OLD."monedaCuenta", OLD."claseCuenta")
     AND contabilidad_param_activa(OLD."tenantId")
     AND EXISTS (SELECT 1 FROM "AsientoLinea" l
                   JOIN "Asiento" a ON a."id" = l."asientoId" AND a."tenantId" = l."tenantId"
                  WHERE l."tenantId" = OLD."tenantId" AND l."cuentaId" = OLD."id" AND a."estado" = 'CONFIRMADO') THEN
    RAISE EXCEPTION 'La cuenta % tiene asientos confirmados: su tipo, moneda y clase no cambian', OLD."codigo"
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "CuentaContable_estable" BEFORE UPDATE ON "CuentaContable"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_cuenta_estable();

-- Numerador: rangos sin superposición en el ejercicio, sin pisar números ya usados, y `ultimo`
-- sólo lo mueve la base al confirmar (desde un trigger: profundidad ≥ 2) y nunca hacia atrás.
CREATE OR REPLACE FUNCTION contabilidad_param_numerador() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_rango boolean := TG_OP = 'INSERT';
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['NumeradorContable']);
  PERFORM contabilidad_exigir_negocio(TG_RELID, NEW."tenantId");
  IF TG_OP = 'UPDATE' THEN
    IF NEW."ultimo" <> OLD."ultimo" AND pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'El último número del numerador % lo asigna la base al confirmar', OLD."codigo"
        USING ERRCODE = '23514';
    END IF;
    IF (NEW."tenantId", NEW."ejercicioId", NEW."codigo") IS DISTINCT FROM (OLD."tenantId", OLD."ejercicioId", OLD."codigo") THEN
      RAISE EXCEPTION 'El numerador % no cambia de ejercicio ni de código: se crea otro', OLD."codigo"
        USING ERRCODE = '23514';
    END IF;
    v_rango := (NEW."desde", NEW."hasta") IS DISTINCT FROM (OLD."desde", OLD."hasta");
  END IF;
  IF v_rango THEN
    -- El candado de abajo serializa, pero el control lee con la foto de la transacción: sólo en
    -- READ COMMITTED esa foto incluye lo que guardó quien soltó el candado.
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'El rango del numerador % se da de alta o se cambia en READ COMMITTED (llegó en %)',
        NEW."codigo", upper(current_setting('transaction_isolation')) USING ERRCODE = '23514';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('contabilidad-numerador:' || NEW."tenantId" || ':' || NEW."ejercicioId", 0));
    IF EXISTS (SELECT 1 FROM "NumeradorContable" n
                WHERE n."tenantId" = NEW."tenantId" AND n."ejercicioId" = NEW."ejercicioId" AND n."id" <> NEW."id"
                  AND int4range(n."desde", n."hasta", '[]') && int4range(NEW."desde", NEW."hasta", '[]')) THEN
      RAISE EXCEPTION 'El rango % a % del numerador % se superpone con otro del mismo ejercicio',
        NEW."desde", NEW."hasta", NEW."codigo" USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "Asiento" a
                WHERE a."tenantId" = NEW."tenantId" AND a."ejercicioId" = NEW."ejercicioId"
                  AND a."numero" > NEW."ultimo" AND a."numero" BETWEEN NEW."desde" AND NEW."hasta") THEN
      RAISE EXCEPTION 'El numerador % daría números ya usados en el ejercicio: subí «último»', NEW."codigo"
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "NumeradorContable_controlar" BEFORE INSERT OR UPDATE ON "NumeradorContable"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_numerador();

-- Toda escritura en PeriodoApertura que no sea la fila GENERAL le escribe "updatedAt" a la fila
-- GENERAL del negocio, ANTES de escribir la suya: espera a las confirmaciones en vuelo (que tienen
-- GENERAL tomada hasta el COMMIT) y deja a GENERAL modificada, así una confirmación con foto vieja
-- (REPEATABLE READ / SERIALIZABLE) recibe 40001 en vez de leer el período anterior al cierre. Sin
-- fila GENERAL no hay nada que esperar: confirmar ya se rechaza. El rastro no anota ese "updatedAt".
CREATE OR REPLACE FUNCTION contabilidad_param_periodo() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fila "PeriodoApertura";
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['PeriodoApertura']);
  IF TG_OP <> 'DELETE' THEN
    PERFORM contabilidad_exigir_negocio(TG_RELID, NEW."tenantId");
  END IF;
  IF TG_OP = 'DELETE' THEN v_fila := OLD; ELSE v_fila := NEW; END IF;
  IF v_fila."claseCuenta" <> 'GENERAL' AND (TG_OP <> 'UPDATE' OR OLD."claseCuenta" <> 'GENERAL') THEN
    UPDATE "PeriodoApertura" SET "updatedAt" = CURRENT_TIMESTAMP
     WHERE "tenantId" = v_fila."tenantId" AND "claseCuenta" = 'GENERAL' AND "id" <> v_fila."id";
    IF TG_OP = 'UPDATE' AND OLD."tenantId" <> NEW."tenantId" THEN
      UPDATE "PeriodoApertura" SET "updatedAt" = CURRENT_TIMESTAMP
       WHERE "tenantId" = OLD."tenantId" AND "claseCuenta" = 'GENERAL';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "PeriodoApertura_serializar" BEFORE INSERT OR UPDATE OR DELETE ON "PeriodoApertura"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_periodo();

-- Vigencias (parte B: indicadores, regímenes, determinación, tolerancias): no se agrega ni se borra
-- una versión con vigencia dentro del período ya cerrado (antes de GENERAL.abiertoDesde).
CREATE OR REPLACE FUNCTION contabilidad_param_vigencia() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fila jsonb;
  v_desde date;
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['IndicadorImpuesto', 'RegimenRetencion', 'DeterminacionCuenta', 'Tolerancia']);
  IF TG_OP <> 'DELETE' THEN
    PERFORM contabilidad_exigir_negocio(TG_RELID, NEW."tenantId");
  END IF;
  IF TG_OP = 'DELETE' THEN v_fila := to_jsonb(OLD); ELSE v_fila := to_jsonb(NEW); END IF;
  SELECT "abiertoDesde" INTO v_desde FROM "PeriodoApertura"
    WHERE "tenantId" = v_fila->>'tenantId' AND "claseCuenta" = 'GENERAL' FOR NO KEY UPDATE;
  IF FOUND AND (v_fila->>'vigenteDesde')::date < v_desde THEN
    RAISE EXCEPTION 'Vigencia % de % dentro de un período cerrado (abierto desde %)',
      v_fila->>'vigenteDesde', TG_TABLE_NAME, v_desde USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Estado de campos (S/O/R) y conversión: los completa la parte B. Si la capa está prendida y la
-- parte B no se aplicó, confirmar se RECHAZA (nunca se saltea el control).
CREATE OR REPLACE FUNCTION contabilidad_param_campos(p "Asiento", p_exige_centro boolean, p_exige_referencia boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Falta aplicar la migración contabilidad_param_b (estado de campos)' USING ERRCODE = '23514';
END $$;

CREATE OR REPLACE FUNCTION contabilidad_param_conversion(p_asiento TEXT, p_tenant TEXT) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Falta aplicar la migración contabilidad_param_b (conversión de moneda)' USING ERRCODE = '23514';
END $$;

-- Lo que la capa controla AL CONFIRMAR, una pasada por asiento (las líneas ya existen: después de
-- confirmar no se agregan, ola 1 `contabilidad_asiento_inmutable`). Devuelve el número que pone la base.
CREATE OR REPLACE FUNCTION contabilidad_param_al_confirmar(p "Asiento") RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_clase RECORD;
  v_gen RECORD;
  v_per RECORD;
  v_l RECORD;
  v_num RECORD;
  v_codigo text;
  v_hay_gen boolean;
BEGIN
  -- 0. Candado de la capa: la fila GENERAL del negocio, la PRIMERA traba, FOR NO KEY UPDATE y hasta el
  --    COMMIT. Las escrituras de períodos la toman primero (contabilidad_param_periodo): el cierre espera
  --    a este asiento, y confirmar+cerrar en una transacción no se cruza con otra confirmación.
  SELECT "abiertoDesde", "abiertoHasta" INTO v_gen FROM "PeriodoApertura"
    WHERE "tenantId" = p."tenantId" AND "claseCuenta" = 'GENERAL' FOR NO KEY UPDATE;
  v_hay_gen := FOUND;

  -- 1. Clase de asiento.
  IF p."claseAsientoId" IS NULL THEN
    RAISE EXCEPTION 'Falta parametrizar: Clases de asiento → el asiento % no tiene clase', p."id" USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_clase FROM "ClaseAsiento"
    WHERE "id" = p."claseAsientoId" AND "tenantId" = p."tenantId" FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta parametrizar: Clases de asiento → clase inexistente' USING ERRCODE = '23514';
  END IF;
  IF NOT v_clase."activa" THEN
    RAISE EXCEPTION 'La clase de asiento % está inactiva', v_clase."codigo" USING ERRCODE = '23514';
  END IF;
  IF COALESCE(p."origenTipo", 'MANUAL') = 'MANUAL' AND NOT v_clase."permiteManual" THEN
    RAISE EXCEPTION 'La clase de asiento % no admite asientos manuales', v_clase."codigo" USING ERRCODE = '23514';
  END IF;

  -- 2. Período GENERAL (leído y trabado en el paso 0).
  IF NOT v_hay_gen THEN
    RAISE EXCEPTION 'Falta parametrizar: Períodos contables → GENERAL' USING ERRCODE = '23514';
  END IF;
  IF p."fecha" < v_gen."abiertoDesde" OR p."fecha" > v_gen."abiertoHasta" THEN
    RAISE EXCEPTION 'La fecha % del asiento cae en un período cerrado (abierto del % al %)',
      p."fecha", v_gen."abiertoDesde", v_gen."abiertoHasta" USING ERRCODE = '23514';
  END IF;

  -- 3. Por clase de cuenta imputada: permitida por la clase de asiento y período de la clase.
  FOR v_l IN
    SELECT DISTINCT COALESCE(c."claseCuenta", 'MAYOR') AS "clase"
      FROM "AsientoLinea" l
      JOIN "CuentaContable" c ON c."id" = l."cuentaId" AND c."tenantId" = l."tenantId"
     WHERE l."tenantId" = p."tenantId" AND l."asientoId" = p."id"
  LOOP
    IF NOT (v_l."clase" = ANY (v_clase."clasesCuentaPermitidas")) THEN
      RAISE EXCEPTION 'La clase de asiento % no imputa cuentas de clase %', v_clase."codigo", v_l."clase"
        USING ERRCODE = '23514';
    END IF;
    -- Sin traba propia: quien escribe esta fila espera antes a GENERAL (paso 0).
    SELECT "abiertoDesde", "abiertoHasta" INTO v_per FROM "PeriodoApertura"
      WHERE "tenantId" = p."tenantId" AND "claseCuenta" = v_l."clase";
    IF FOUND AND (p."fecha" < v_per."abiertoDesde" OR p."fecha" > v_per."abiertoHasta") THEN
      RAISE EXCEPTION 'La fecha % cae en un período cerrado para las cuentas de clase % (abierto del % al %)',
        p."fecha", v_l."clase", v_per."abiertoDesde", v_per."abiertoHasta" USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- 4. Centro de costo vigente y activo a la fecha del asiento.
  SELECT cc."codigo" INTO v_codigo
    FROM "AsientoLinea" l
    JOIN "CentroCosto" cc ON cc."id" = l."centroCostoId" AND cc."tenantId" = l."tenantId"
   WHERE l."tenantId" = p."tenantId" AND l."asientoId" = p."id"
     AND (NOT cc."activo" OR p."fecha" < cc."vigenteDesde" OR (cc."vigenteHasta" IS NOT NULL AND p."fecha" > cc."vigenteHasta"))
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'El centro de costo % no está vigente el %', v_codigo, p."fecha" USING ERRCODE = '23514';
  END IF;

  -- 5. Estado de campos (parte B).
  PERFORM contabilidad_param_campos(p, v_clase."exigeCentroCosto", v_clase."exigeReferencia");

  -- 6. Número: lo pone la base, en la misma transacción (si se revierte, el número vuelve).
  v_codigo := COALESCE(v_clase."numeradorCodigo", 'DIARIO');
  SELECT "id", "hasta", "ultimo" INTO v_num FROM "NumeradorContable"
    WHERE "tenantId" = p."tenantId" AND "ejercicioId" = p."ejercicioId" AND "codigo" = v_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta parametrizar: Numeradores → % del ejercicio', v_codigo USING ERRCODE = '23514';
  END IF;
  IF v_num."ultimo" >= v_num."hasta" THEN
    RAISE EXCEPTION 'El numerador % se agotó (llegó a %)', v_codigo, v_num."hasta" USING ERRCODE = '23514';
  END IF;
  UPDATE "NumeradorContable" SET "ultimo" = "ultimo" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = v_num."id";
  RETURN v_num."ultimo" + 1;
END $$;

-- Ola 1 `:284` ampliada. Lo de siempre (ejercicio abierto del mismo negocio, fecha adentro), ahora
-- leyendo el ejercicio también por "tenantId"; y, SÓLO con la capa prendida: actor del alta y, al
-- confirmar (BORRADOR → CONFIRMADO, o alta ya confirmada), los controles de la capa y el número.
CREATE OR REPLACE FUNCTION contabilidad_asiento_en_ejercicio() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_ej RECORD;
  v_confirma boolean;
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['Asiento']);
  PERFORM contabilidad_exigir_negocio(TG_RELID, NEW."tenantId");
  SELECT "tenantId", "estado", "fechaInicio", "fechaCierre" INTO v_ej
    FROM "Ejercicio" WHERE "id" = NEW."ejercicioId" AND "tenantId" = NEW."tenantId" FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El asiento % no tiene un ejercicio válido', NEW."id" USING ERRCODE = '23514';
  END IF;
  IF v_ej."estado" <> 'ABIERTO' THEN
    RAISE EXCEPTION 'El ejercicio del asiento % está cerrado', NEW."id" USING ERRCODE = '23514';
  END IF;
  IF NEW."fecha" < v_ej."fechaInicio" OR NEW."fecha" > v_ej."fechaCierre" THEN
    RAISE EXCEPTION 'La fecha % del asiento % queda fuera de su ejercicio (% a %)',
      NEW."fecha", NEW."id", v_ej."fechaInicio", v_ej."fechaCierre" USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_confirma := NEW."estado" = 'CONFIRMADO';
  ELSE
    v_confirma := NEW."estado" = 'CONFIRMADO' AND OLD."estado" IS DISTINCT FROM 'CONFIRMADO';
  END IF;
  IF (TG_OP = 'INSERT' OR v_confirma) AND contabilidad_param_activa(NEW."tenantId") THEN
    IF TG_OP = 'INSERT' THEN
      NEW."creadoPor" := COALESCE(contabilidad_param_actor(), NEW."creadoPor");
    END IF;
    IF v_confirma THEN
      NEW."numero" := contabilidad_param_al_confirmar(NEW);
      NEW."confirmadoPor" := COALESCE(contabilidad_param_actor(), NEW."confirmadoPor");
      NEW."confirmadoEn" := CURRENT_TIMESTAMP;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Ola 1 `:209` (con el filtro por negocio de 20261112120000) ampliada: con la capa prendida, en el
-- evento de la cabecera que la confirma (una vez por asiento, al COMMIT) controla la conversión.
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
  -- IF anidados: en el evento de una línea, NEW no tiene "estado" (plpgsql no corta el AND).
  IF TG_TABLE_NAME = 'Asiento' THEN
    IF NEW."estado" = 'CONFIRMADO' AND contabilidad_param_activa(v_tenant) THEN
      PERFORM contabilidad_param_conversion(v_asiento, v_tenant);
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- Ola 1 `:314`/`:319`: las búsquedas de asientos del ejercicio, filtradas también por negocio (usan
-- el índice ("tenantId", "ejercicioId", "numero") en vez de recorrer los asientos de todos).
CREATE OR REPLACE FUNCTION contabilidad_controlar_ejercicio() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['Ejercicio']);
  IF NEW."estado" = 'CERRADO' AND OLD."estado" <> 'CERRADO'
     AND EXISTS (SELECT 1 FROM "Asiento" WHERE "tenantId" = OLD."tenantId" AND "ejercicioId" = OLD."id"
                 AND "estado" = 'BORRADOR') THEN
    RAISE EXCEPTION 'El ejercicio % tiene asientos en borrador: confirmalos o borralos antes de cerrarlo', OLD."id"
      USING ERRCODE = '23514';
  END IF;
  IF (NEW."fechaInicio" > OLD."fechaInicio" OR NEW."fechaCierre" < OLD."fechaCierre")
     AND EXISTS (SELECT 1 FROM "Asiento" WHERE "tenantId" = OLD."tenantId" AND "ejercicioId" = OLD."id"
                 AND ("fecha" < NEW."fechaInicio" OR "fecha" > NEW."fechaCierre")) THEN
    RAISE EXCEPTION 'El ejercicio % tiene asientos fuera de las fechas nuevas', OLD."id" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    ALTER FUNCTION contabilidad_param_activa(TEXT) OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_rastro() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_rastro_inmutable() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_cuenta_estable() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_numerador() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_vigencia() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_periodo() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_campos("Asiento", boolean, boolean) OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_conversion(TEXT, TEXT) OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_al_confirmar("Asiento") OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_asiento_en_ejercicio() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_controlar_cuadre() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_controlar_ejercicio() OWNER TO neondb_owner;
  END IF;
END $$;

-- Sin EXECUTE para PUBLIC (ver 20261112120000: los triggers legítimos siguen andando; una tabla TEMP
-- de app_rls ya no puede apuntarles un trigger, ni llamarlas directo). 0002 lo repite.
REVOKE EXECUTE ON FUNCTION contabilidad_param_activa(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_rastro() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_rastro_inmutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_cuenta_estable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_numerador() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_vigencia() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_periodo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_campos("Asiento", boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_conversion(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_al_confirmar("Asiento") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_asiento_en_ejercicio() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_controlar_cuadre() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_controlar_ejercicio() FROM PUBLIC;

-- ── RLS: misma policy que el resto (prisma/rls/0001_enable_rls.sql la recrea igual) ───────────

ALTER TABLE "PeriodoApertura" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PeriodoApertura";
CREATE POLICY tenant_isolation ON "PeriodoApertura"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "NumeradorContable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "NumeradorContable";
CREATE POLICY tenant_isolation ON "NumeradorContable"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ClaseAsiento" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClaseAsiento";
CREATE POLICY tenant_isolation ON "ClaseAsiento"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "CentroCosto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CentroCosto";
CREATE POLICY tenant_isolation ON "CentroCosto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ParamCambio" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ParamCambio";
CREATE POLICY tenant_isolation ON "ParamCambio"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Permisos de la app (ver encabezado). Guardado por la existencia del rol; 0002 repite el recorte.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "ParamCambio" FROM app_rls;
    GRANT SELECT ON "ParamCambio" TO app_rls;
    REVOKE UPDATE, TRUNCATE ON "NumeradorContable" FROM app_rls;
    GRANT SELECT, INSERT, DELETE ON "NumeradorContable" TO app_rls;
    GRANT UPDATE ("desde", "hasta", "updatedAt") ON "NumeradorContable" TO app_rls;
  END IF;
END $$;
