-- Contabilidad, ola 1 (docs/producto/contabilidad/PLAN.md §5): plan de cuentas, ejercicios, asientos,
-- obligaciones y vencimientos fiscales. ADITIVA: sólo crea tablas, funciones y triggers nuevos; no toca datos.
-- Escrita SIN aplicar (Gate 2). El código tolera su ausencia (P2021 → error claro, src/lib/contabilidad/repo.ts).

-- CreateTable
CREATE TABLE "CuentaContable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "naturaleza" TEXT NOT NULL,
    "padreId" TEXT,
    "imputable" BOOLEAN NOT NULL DEFAULT true,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaContable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ejercicio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "fechaCierre" DATE NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ejercicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asiento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ejercicioId" TEXT NOT NULL,
    "numero" INTEGER,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "origenTipo" TEXT,
    "origenId" TEXT,
    "anulaAsientoId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsientoLinea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "asientoId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "debe" BIGINT NOT NULL DEFAULT 0,
    "haber" BIGINT NOT NULL DEFAULT 0,
    "detalle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsientoLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObligacionFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "organismo" TEXT NOT NULL,
    "jurisdiccion" TEXT,
    "periodicidad" TEXT NOT NULL,
    "accion" TEXT NOT NULL DEFAULT 'AMBAS',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObligacionFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VencimientoFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "obligacionId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "cuota" INTEGER NOT NULL DEFAULT 0,
    "fechaVencimiento" DATE NOT NULL,
    "fechaPresentacion" DATE,
    "fechaPago" DATE,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VencimientoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CuentaContable_tenantId_padreId_idx" ON "CuentaContable"("tenantId", "padreId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaContable_tenantId_codigo_key" ON "CuentaContable"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaContable_id_tenantId_key" ON "CuentaContable"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Ejercicio_tenantId_fechaInicio_idx" ON "Ejercicio"("tenantId", "fechaInicio");

-- CreateIndex
CREATE UNIQUE INDEX "Ejercicio_id_tenantId_key" ON "Ejercicio"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Asiento_tenantId_fecha_idx" ON "Asiento"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Asiento_tenantId_ejercicioId_numero_key" ON "Asiento"("tenantId", "ejercicioId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Asiento_id_tenantId_key" ON "Asiento"("id", "tenantId");

-- CreateIndex
CREATE INDEX "AsientoLinea_tenantId_asientoId_idx" ON "AsientoLinea"("tenantId", "asientoId");

-- CreateIndex
CREATE INDEX "AsientoLinea_tenantId_cuentaId_idx" ON "AsientoLinea"("tenantId", "cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "ObligacionFiscal_tenantId_codigo_key" ON "ObligacionFiscal"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ObligacionFiscal_id_tenantId_key" ON "ObligacionFiscal"("id", "tenantId");

-- CreateIndex
CREATE INDEX "VencimientoFiscal_tenantId_fechaVencimiento_idx" ON "VencimientoFiscal"("tenantId", "fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "VencimientoFiscal_tenantId_obligacionId_periodo_cuota_key" ON "VencimientoFiscal"("tenantId", "obligacionId", "periodo", "cuota");

-- AddForeignKey
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_padreId_tenantId_fkey" FOREIGN KEY ("padreId", "tenantId") REFERENCES "CuentaContable"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ejercicio" ADD CONSTRAINT "Ejercicio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_ejercicioId_tenantId_fkey" FOREIGN KEY ("ejercicioId", "tenantId") REFERENCES "Ejercicio"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_anulaAsientoId_tenantId_fkey" FOREIGN KEY ("anulaAsientoId", "tenantId") REFERENCES "Asiento"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoLinea" ADD CONSTRAINT "AsientoLinea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoLinea" ADD CONSTRAINT "AsientoLinea_asientoId_tenantId_fkey" FOREIGN KEY ("asientoId", "tenantId") REFERENCES "Asiento"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsientoLinea" ADD CONSTRAINT "AsientoLinea_cuentaId_tenantId_fkey" FOREIGN KEY ("cuentaId", "tenantId") REFERENCES "CuentaContable"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligacionFiscal" ADD CONSTRAINT "ObligacionFiscal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VencimientoFiscal" ADD CONSTRAINT "VencimientoFiscal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VencimientoFiscal" ADD CONSTRAINT "VencimientoFiscal_obligacionId_tenantId_fkey" FOREIGN KEY ("obligacionId", "tenantId") REFERENCES "ObligacionFiscal"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Reglas que la base sostiene aunque el código se equivoque ───────────────────────────────

-- Una línea es SÓLO debe o SÓLO haber, y mayor que cero (centavos).
ALTER TABLE "AsientoLinea" ADD CONSTRAINT "AsientoLinea_debe_o_haber_check"
  CHECK ("debe" >= 0 AND "haber" >= 0 AND ("debe" = 0) <> ("haber" = 0));

ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_estado_check" CHECK ("estado" IN ('BORRADOR', 'CONFIRMADO'));
-- El número existe si y sólo si el asiento está confirmado (se asigna al confirmar).
ALTER TABLE "Asiento" ADD CONSTRAINT "Asiento_numero_al_confirmar_check"
  CHECK ((("estado" = 'CONFIRMADO') = ("numero" IS NOT NULL)) AND ("numero" IS NULL OR "numero" > 0));
-- Un asiento se anula una sola vez.
CREATE UNIQUE INDEX "Asiento_tenantId_anulaAsientoId_key" ON "Asiento"("tenantId", "anulaAsientoId") WHERE "anulaAsientoId" IS NOT NULL;

ALTER TABLE "Ejercicio" ADD CONSTRAINT "Ejercicio_estado_check" CHECK ("estado" IN ('ABIERTO', 'CERRADO'));
ALTER TABLE "Ejercicio" ADD CONSTRAINT "Ejercicio_fechas_check" CHECK ("fechaCierre" >= "fechaInicio");

ALTER TABLE "VencimientoFiscal" ADD CONSTRAINT "VencimientoFiscal_periodo_check"
  CHECK ("periodo" ~ '^[0-9]{4}(-(0[1-9]|1[0-2]))?$' AND "cuota" >= 0);

-- Las funciones de abajo son SECURITY DEFINER con search_path fijo: corren como el dueño de las
-- tablas (neondb_owner, exento de RLS porque no hay FORCE ROW LEVEL SECURITY) y validan por id,
-- sin depender de `app.current_tenant_id`. Así no se las engaña cambiando de negocio antes del
-- COMMIT (el trigger diferido corre con el negocio vigente AL COMMIT, no al escribir).
-- Las lecturas del asiento/ejercicio van con FOR SHARE: en READ COMMITTED esperan a la
-- transacción que lo está tocando y leen lo commiteado; en REPEATABLE READ/SERIALIZABLE, si cambió
-- después de la foto, cortan con error de serialización (40001) en vez de decidir con datos viejos.

-- Un asiento CONFIRMADO cuadra: ≥ 2 líneas, Σ debe = Σ haber, total > 0. Diferido al COMMIT para que
-- el alta (cabecera + líneas + confirmación) se valide entera. Corre también al DELETE de líneas.
CREATE OR REPLACE FUNCTION contabilidad_controlar_cuadre() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asiento TEXT;
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
  SELECT "estado" INTO v_estado FROM "Asiento" WHERE "id" = v_asiento FOR SHARE;
  IF v_estado IS DISTINCT FROM 'CONFIRMADO' THEN
    RETURN NULL;
  END IF;
  SELECT COUNT(*), COALESCE(SUM("debe"), 0), COALESCE(SUM("haber"), 0)
    INTO v_n, v_debe, v_haber
    FROM "AsientoLinea" WHERE "asientoId" = v_asiento;
  IF v_n < 2 OR v_debe <> v_haber OR v_debe = 0 THEN
    RAISE EXCEPTION 'Asiento % descuadrado: % líneas, debe %, haber %', v_asiento, v_n, v_debe, v_haber
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER "AsientoLinea_cuadre"
  AFTER INSERT OR UPDATE OR DELETE ON "AsientoLinea"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION contabilidad_controlar_cuadre();
CREATE CONSTRAINT TRIGGER "Asiento_cuadre"
  AFTER INSERT OR UPDATE ON "Asiento"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION contabilidad_controlar_cuadre();

-- Un asiento CONFIRMADO no se edita ni se borra (se contra-asienta), y sus líneas tampoco.
-- El estado de la cabecera se lee con FOR SHARE: una transacción con foto vieja (REPEATABLE READ,
-- tomada antes de la confirmación) no puede borrar ni agregar líneas a un asiento ya confirmado.
CREATE OR REPLACE FUNCTION contabilidad_asiento_inmutable() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estado TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Asiento' THEN
    IF OLD."estado" = 'CONFIRMADO' THEN
      RAISE EXCEPTION 'El asiento % está confirmado: no se edita ni se borra, se contra-asienta', OLD."id"
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT "estado" INTO v_estado FROM "Asiento"
      WHERE "id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."asientoId" ELSE NEW."asientoId" END
      FOR SHARE;
    IF v_estado = 'CONFIRMADO' THEN
      RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD."asientoId" <> NEW."asientoId" THEN
      SELECT "estado" INTO v_estado FROM "Asiento" WHERE "id" = OLD."asientoId" FOR SHARE;
      IF v_estado = 'CONFIRMADO' THEN
        RAISE EXCEPTION 'Las líneas de un asiento confirmado no se modifican' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Asiento_inmutable" BEFORE UPDATE OR DELETE ON "Asiento"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_asiento_inmutable();
CREATE TRIGGER "AsientoLinea_inmutable" BEFORE INSERT OR UPDATE OR DELETE ON "AsientoLinea"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_asiento_inmutable();

-- Todo asiento que se escribe (alta, cambio o confirmación) cae en un ejercicio ABIERTO del mismo
-- negocio y con la fecha adentro. Un ejercicio CERRADO no admite asientos nuevos ni confirmaciones.
CREATE OR REPLACE FUNCTION contabilidad_asiento_en_ejercicio() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ej RECORD;
BEGIN
  SELECT "tenantId", "estado", "fechaInicio", "fechaCierre" INTO v_ej
    FROM "Ejercicio" WHERE "id" = NEW."ejercicioId" FOR SHARE;
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

CREATE TRIGGER "Asiento_en_ejercicio" BEFORE INSERT OR UPDATE ON "Asiento"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_asiento_en_ejercicio();

-- Un ejercicio con borradores no se cierra (se confirman o se borran antes), y no se le achican
-- las fechas dejando asientos afuera. Reabrir (CERRADO → ABIERTO) queda permitido a nivel base:
-- es una decisión de producto que sostiene la app.
CREATE OR REPLACE FUNCTION contabilidad_controlar_ejercicio() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW."estado" = 'CERRADO' AND OLD."estado" <> 'CERRADO'
     AND EXISTS (SELECT 1 FROM "Asiento" WHERE "ejercicioId" = OLD."id" AND "estado" = 'BORRADOR') THEN
    RAISE EXCEPTION 'El ejercicio % tiene asientos en borrador: confirmalos o borralos antes de cerrarlo', OLD."id"
      USING ERRCODE = '23514';
  END IF;
  IF (NEW."fechaInicio" > OLD."fechaInicio" OR NEW."fechaCierre" < OLD."fechaCierre")
     AND EXISTS (SELECT 1 FROM "Asiento" WHERE "ejercicioId" = OLD."id"
                 AND ("fecha" < NEW."fechaInicio" OR "fecha" > NEW."fechaCierre")) THEN
    RAISE EXCEPTION 'El ejercicio % tiene asientos fuera de las fechas nuevas', OLD."id" USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Ejercicio_controlar" BEFORE UPDATE ON "Ejercicio"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_controlar_ejercicio();

-- Dueño explícito de las funciones SECURITY DEFINER: el de las tablas (en Neon y en la base de
-- prueba la migración ya corre como neondb_owner; esto lo fija si la corriera otro rol).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    ALTER FUNCTION contabilidad_controlar_cuadre() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_asiento_inmutable() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_asiento_en_ejercicio() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_controlar_ejercicio() OWNER TO neondb_owner;
  END IF;
END $$;

-- ── RLS: misma policy que el resto (prisma/rls/0001_enable_rls.sql la recrea igual) ───────────

ALTER TABLE "CuentaContable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CuentaContable";
CREATE POLICY tenant_isolation ON "CuentaContable"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Ejercicio" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Ejercicio";
CREATE POLICY tenant_isolation ON "Ejercicio"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Asiento" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Asiento";
CREATE POLICY tenant_isolation ON "Asiento"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AsientoLinea" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AsientoLinea";
CREATE POLICY tenant_isolation ON "AsientoLinea"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ObligacionFiscal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ObligacionFiscal";
CREATE POLICY tenant_isolation ON "ObligacionFiscal"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "VencimientoFiscal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VencimientoFiscal";
CREATE POLICY tenant_isolation ON "VencimientoFiscal"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
