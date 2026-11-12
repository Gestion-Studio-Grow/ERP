-- Contabilidad · capa de PARAMETRIZACIÓN, parte B (R2-diseno-parametrizacion.md §2 y §4).
--
-- ADITIVA, escrita SIN aplicar (Gate 2). Requiere 20261112130000_contabilidad_param_a.
-- Crea TipoCotizacion, Cotizacion, IndicadorImpuesto, RegimenRetencion, DeterminacionCuenta,
-- Tolerancia y GrupoCampos; agrega CuentaContable.grupoCamposId (nullable) y las FK de
-- AsientoLinea.indicadorImpuestoId / regimenRetencionId; reemplaza las funciones de la parte A que
-- rechazaban (estado de campos y conversión) por las reales.
--
-- INERTE con `ConfigContable.parametrizacion IS NULL`: ningún trigger de asiento llama a estas
-- funciones; los triggers de las tablas nuevas sólo actúan sobre filas de las tablas nuevas, y el de
-- CuentaContable sólo si la cuenta tiene grupo de campos (columna nueva, NULL en todas).
--
-- Decisiones PROVISIONALES A CONFIRMAR: `RegimenRetencion.base` (NETO_GRAVADO · TOTAL · IVA) y que la
-- practicada exija base; cuenta del indicador por clase (débito → PASIVO; crédito y percepción
-- sufrida → ACTIVO; exento y no gravado sin cuenta); el conflicto S + R «al guardar» se controla
-- para centro de costo (cuentas de resultado) y referencia, sobre las clases de cuenta permitidas.

CREATE TABLE "TipoCotizacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "fuente" TEXT NOT NULL DEFAULT '',
    "maxDiasAtras" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TipoCotizacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TipoCotizacion_codigo_check" CHECK ("codigo" IN ('BNA_VEND_DIVISA', 'BNA_COMP_DIVISA', 'MEP', 'PACTADA')),
    CONSTRAINT "TipoCotizacion_maxDiasAtras_check" CHECK ("maxDiasAtras" >= 0)
);

-- Valor: pesos por unidad con 6 decimales enteros. Sólo-agregar: corregir = versión + 1.
CREATE TABLE "Cotizacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipoCotizacionId" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "valor" BIGINT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cargadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Cotizacion_moneda_check" CHECK ("moneda" ~ '^[A-Z]{3}$'),
    CONSTRAINT "Cotizacion_valor_check" CHECK ("valor" > 0),
    CONSTRAINT "Cotizacion_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "IndicadorImpuesto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "clase" TEXT NOT NULL,
    "alicuotaBp" INTEGER NOT NULL DEFAULT 0,
    "jurisdiccion" TEXT,
    "cuentaId" TEXT,
    "vigenteDesde" DATE NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndicadorImpuesto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IndicadorImpuesto_codigo_check" CHECK ("codigo" ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT "IndicadorImpuesto_clase_check"
      CHECK ("clase" IN ('IVA_DEBITO', 'IVA_CREDITO', 'PERCEPCION_SUFRIDA', 'EXENTO', 'NO_GRAVADO')),
    CONSTRAINT "IndicadorImpuesto_alicuotaBp_check" CHECK ("alicuotaBp" BETWEEN 0 AND 10000),
    CONSTRAINT "IndicadorImpuesto_cuenta_check" CHECK ("clase" IN ('EXENTO', 'NO_GRAVADO') OR "cuentaId" IS NOT NULL)
);

-- La sufrida no se calcula (se carga el importe del certificado); la practicada sí.
CREATE TABLE "RegimenRetencion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "impuesto" TEXT NOT NULL,
    "jurisdiccion" TEXT,
    "sentido" TEXT NOT NULL,
    "codigoRegimen" TEXT,
    "base" TEXT,
    "alicuotaBp" INTEGER,
    "minimoCentavos" BIGINT NOT NULL DEFAULT 0,
    "cuentaId" TEXT NOT NULL,
    "exigeCertificado" BOOLEAN NOT NULL DEFAULT false,
    "vigenteDesde" DATE NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegimenRetencion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RegimenRetencion_codigo_check" CHECK ("codigo" ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT "RegimenRetencion_impuesto_check" CHECK ("impuesto" IN ('IVA', 'GANANCIAS', 'IIBB', 'SUSS')),
    CONSTRAINT "RegimenRetencion_sentido_check" CHECK ("sentido" IN ('SUFRIDA', 'PRACTICADA')),
    CONSTRAINT "RegimenRetencion_base_check"
      CHECK (("base" IS NULL OR "base" IN ('NETO_GRAVADO', 'TOTAL', 'IVA')) AND ("sentido" = 'SUFRIDA' OR "base" IS NOT NULL)),
    CONSTRAINT "RegimenRetencion_alicuotaBp_check" CHECK ("alicuotaBp" IS NULL OR "alicuotaBp" BETWEEN 0 AND 10000),
    CONSTRAINT "RegimenRetencion_minimo_check" CHECK ("minimoCentavos" >= 0)
);

-- Rol × dimensión × clave → cuenta, con vigencia. CuentaRol queda intacta (nivel sin clave).
-- El catálogo de roles es el de src/lib/contabilidad/roles.ts (ROLES_CUENTA); un test lo compara.
CREATE TABLE "DeterminacionCuenta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeterminacionCuenta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeterminacionCuenta_rol_check" CHECK ("rol" IN (
      'CAJA', 'BANCO', 'BILLETERA_MP', 'DEUDORES_POR_VENTAS', 'TARJETAS_A_COBRAR', 'MP_A_LIQUIDAR',
      'IVA_CREDITO_FISCAL', 'PERCEPCIONES_IIBB', 'RETENCIONES_IIBB', 'RETENCIONES_IVA', 'RETENCIONES_GANANCIAS',
      'IDC_A_CUENTA', 'MERCADERIAS', 'FONDOS_A_RENDIR', 'CUENTA_PARTICULAR', 'AMORTIZACIONES_ACUMULADAS',
      'PROVEEDORES', 'IVA_DEBITO_FISCAL', 'IVA_A_PAGAR', 'IIBB_A_PAGAR', 'SUELDOS_A_PAGAR',
      'CARGAS_SOCIALES_A_PAGAR', 'PROVISION_SAC', 'PROVISION_VACACIONES', 'COMISIONES_A_PAGAR',
      'ANTICIPOS_DE_CLIENTES', 'VOUCHERS_A_CANJEAR', 'FONDOS_PAUTA_CLIENTES', 'CAPITAL', 'AJUSTE_DE_CAPITAL',
      'RESULTADOS_NO_ASIGNADOS', 'RESULTADO_DEL_EJERCICIO', 'AJUSTES_EJERCICIOS_ANTERIORES', 'VENTAS',
      'FEES_GESTION_PAUTA', 'INTERESES_GANADOS', 'OTROS_INGRESOS', 'VOUCHERS_VENCIDOS', 'COSTO_DE_VENTAS',
      'COMISIONES_PERSONAL', 'INSUMOS', 'SUELDOS', 'SAC_Y_VACACIONES', 'AMORTIZACIONES', 'MONOTRIBUTO',
      'GASTOS_SIN_CATEGORIA', 'GASTOS_BANCARIOS', 'IIBB', 'IDC', 'COMISIONES_DE_COBRO', 'RECPAM',
      'DEUDORES_INCOBRABLES', 'SALDO_TECNICO_IVA', 'ANTICIPOS_GANANCIAS', 'GANANCIAS_A_PAGAR', 'BANCO_USD',
      'VALORES_A_DEPOSITAR', 'PERCEPCIONES_IVA', 'SALDO_LIBRE_DISPONIBILIDAD_IVA', 'RECAUDACION_BANCARIA_IIBB',
      'CHEQUES_DIFERIDOS_A_PAGAR', 'RETENCIONES_IVA_A_DEPOSITAR', 'RETENCIONES_GANANCIAS_A_DEPOSITAR',
      'RETENCIONES_IIBB_A_DEPOSITAR', 'DIFERENCIA_DE_CAMBIO')),
    CONSTRAINT "DeterminacionCuenta_dimension_check"
      CHECK ("dimension" IN ('MONEDA', 'JURISDICCION', 'MEDIO_PAGO', 'CUENTA_BANCARIA')),
    CONSTRAINT "DeterminacionCuenta_clave_check"
      CHECK (length(btrim("clave")) > 0 AND ("dimension" <> 'MONEDA' OR "clave" ~ '^[A-Z]{3}$'))
);

-- Sin fila = cero (no hay tolerancia por defecto).
CREATE TABLE "Tolerancia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "valor" BIGINT NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tolerancia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Tolerancia_codigo_check" CHECK ("codigo" IN (
      'REDONDEO_CONVERSION_CENTAVOS', 'DIFERENCIA_COBRO_CENTAVOS', 'DIFERENCIA_COBRO_BP', 'DIFERENCIA_PAGO_CENTAVOS')),
    CONSTRAINT "Tolerancia_valor_check" CHECK ("valor" >= 0)
);

-- S = suprimido · O = opcional · R = requerido, por campo de la línea (referencia: de la cabecera).
CREATE TABLE "GrupoCampos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "centroCosto" TEXT NOT NULL DEFAULT 'O',
    "detalle" TEXT NOT NULL DEFAULT 'O',
    "monedaOrigen" TEXT NOT NULL DEFAULT 'O',
    "fechaOrigen" TEXT NOT NULL DEFAULT 'O',
    "referencia" TEXT NOT NULL DEFAULT 'O',
    "indicadorImpuesto" TEXT NOT NULL DEFAULT 'O',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoCampos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GrupoCampos_codigo_check" CHECK ("codigo" ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT "GrupoCampos_estados_check" CHECK (
      "centroCosto" IN ('S', 'O', 'R') AND "detalle" IN ('S', 'O', 'R') AND "monedaOrigen" IN ('S', 'O', 'R')
      AND "fechaOrigen" IN ('S', 'O', 'R') AND "referencia" IN ('S', 'O', 'R') AND "indicadorImpuesto" IN ('S', 'O', 'R'))
);

ALTER TABLE "CuentaContable" ADD COLUMN "grupoCamposId" TEXT;

-- ── Índices ─────────────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX "TipoCotizacion_tenantId_codigo_key" ON "TipoCotizacion"("tenantId", "codigo");
CREATE UNIQUE INDEX "TipoCotizacion_id_tenantId_key" ON "TipoCotizacion"("id", "tenantId");
CREATE UNIQUE INDEX "Cotizacion_tenantId_tipoCotizacionId_moneda_fecha_version_key" ON "Cotizacion"("tenantId", "tipoCotizacionId", "moneda", "fecha", "version");
CREATE UNIQUE INDEX "Cotizacion_id_tenantId_key" ON "Cotizacion"("id", "tenantId");
CREATE UNIQUE INDEX "IndicadorImpuesto_tenantId_codigo_vigenteDesde_key" ON "IndicadorImpuesto"("tenantId", "codigo", "vigenteDesde");
CREATE UNIQUE INDEX "IndicadorImpuesto_id_tenantId_key" ON "IndicadorImpuesto"("id", "tenantId");
CREATE UNIQUE INDEX "RegimenRetencion_tenantId_codigo_vigenteDesde_key" ON "RegimenRetencion"("tenantId", "codigo", "vigenteDesde");
CREATE UNIQUE INDEX "RegimenRetencion_id_tenantId_key" ON "RegimenRetencion"("id", "tenantId");
CREATE UNIQUE INDEX "DeterminacionCuenta_tenantId_rol_dimension_clave_vigenteDes_key" ON "DeterminacionCuenta"("tenantId", "rol", "dimension", "clave", "vigenteDesde");
CREATE UNIQUE INDEX "DeterminacionCuenta_id_tenantId_key" ON "DeterminacionCuenta"("id", "tenantId");
CREATE UNIQUE INDEX "Tolerancia_tenantId_codigo_vigenteDesde_key" ON "Tolerancia"("tenantId", "codigo", "vigenteDesde");
CREATE UNIQUE INDEX "Tolerancia_id_tenantId_key" ON "Tolerancia"("id", "tenantId");
CREATE UNIQUE INDEX "GrupoCampos_tenantId_codigo_key" ON "GrupoCampos"("tenantId", "codigo");
CREATE UNIQUE INDEX "GrupoCampos_id_tenantId_key" ON "GrupoCampos"("id", "tenantId");

-- ── FK compuestas con "tenantId" ────────────────────────────────────────────────────────────────

ALTER TABLE "TipoCotizacion" ADD CONSTRAINT "TipoCotizacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_tipoCotizacionId_tenantId_fkey" FOREIGN KEY ("tipoCotizacionId", "tenantId") REFERENCES "TipoCotizacion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndicadorImpuesto" ADD CONSTRAINT "IndicadorImpuesto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IndicadorImpuesto" ADD CONSTRAINT "IndicadorImpuesto_cuentaId_tenantId_fkey" FOREIGN KEY ("cuentaId", "tenantId") REFERENCES "CuentaContable"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegimenRetencion" ADD CONSTRAINT "RegimenRetencion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegimenRetencion" ADD CONSTRAINT "RegimenRetencion_cuentaId_tenantId_fkey" FOREIGN KEY ("cuentaId", "tenantId") REFERENCES "CuentaContable"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeterminacionCuenta" ADD CONSTRAINT "DeterminacionCuenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeterminacionCuenta" ADD CONSTRAINT "DeterminacionCuenta_cuentaId_tenantId_fkey" FOREIGN KEY ("cuentaId", "tenantId") REFERENCES "CuentaContable"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tolerancia" ADD CONSTRAINT "Tolerancia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrupoCampos" ADD CONSTRAINT "GrupoCampos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_grupoCamposId_tenantId_fkey" FOREIGN KEY ("grupoCamposId", "tenantId") REFERENCES "GrupoCampos"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AsientoLinea" ADD CONSTRAINT "AsientoLinea_indicadorImpuestoId_tenantId_fkey" FOREIGN KEY ("indicadorImpuestoId", "tenantId") REFERENCES "IndicadorImpuesto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AsientoLinea" ADD CONSTRAINT "AsientoLinea_regimenRetencionId_tenantId_fkey" FOREIGN KEY ("regimenRetencionId", "tenantId") REFERENCES "RegimenRetencion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Reglas de la base ───────────────────────────────────────────────────────────────────────────

-- Cotización: sólo-agregar; la versión n exige la n-1; `cargadoPor` = actor si lo hay.
CREATE OR REPLACE FUNCTION contabilidad_param_cotizacion() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['Cotizacion']);
  IF TG_OP <> 'DELETE' THEN
    PERFORM contabilidad_exigir_negocio(TG_RELID, NEW."tenantId");
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Una cotización cargada no se cambia ni se borra: se carga una versión nueva' USING ERRCODE = '23514';
  END IF;
  IF NEW."version" > 1 AND NOT EXISTS (
       SELECT 1 FROM "Cotizacion" WHERE "tenantId" = NEW."tenantId" AND "tipoCotizacionId" = NEW."tipoCotizacionId"
         AND "moneda" = NEW."moneda" AND "fecha" = NEW."fecha" AND "version" = NEW."version" - 1) THEN
    RAISE EXCEPTION 'La versión % de la cotización exige la %', NEW."version", NEW."version" - 1 USING ERRCODE = '23514';
  END IF;
  NEW."cargadoPor" := COALESCE(contabilidad_param_actor(), NEW."cargadoPor");
  RETURN NEW;
END $$;

CREATE TRIGGER "Cotizacion_solo_agregar" BEFORE INSERT OR UPDATE OR DELETE ON "Cotizacion"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_cotizacion();
CREATE TRIGGER "Cotizacion_sin_truncate" BEFORE TRUNCATE ON "Cotizacion"
  FOR EACH STATEMENT EXECUTE FUNCTION contabilidad_param_rastro_inmutable();

-- Fila versionada: lo sustantivo no se edita (se agrega otra fila con su vigencia); sólo `nombre`
-- y `activa` cambian.
CREATE OR REPLACE FUNCTION contabilidad_param_versionada() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['IndicadorImpuesto', 'RegimenRetencion', 'DeterminacionCuenta', 'Tolerancia']);
  IF (to_jsonb(NEW) - 'nombre' - 'activa' - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'nombre' - 'activa' - 'updatedAt') THEN
    RAISE EXCEPTION '% no se edita: cargá una versión nueva con su fecha de vigencia', TG_TABLE_NAME USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- Cuenta del tipo que corresponde: retención sufrida → ACTIVO, practicada → PASIVO; IVA débito →
-- PASIVO; IVA crédito y percepción sufrida → ACTIVO.
CREATE OR REPLACE FUNCTION contabilidad_param_cuenta_impuesto() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fila jsonb := to_jsonb(NEW);
  v_esperado text;
  v_tipo text;
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['IndicadorImpuesto', 'RegimenRetencion']);
  PERFORM contabilidad_exigir_negocio(TG_RELID, NEW."tenantId");
  IF TG_TABLE_NAME = 'RegimenRetencion' THEN
    v_esperado := CASE v_fila->>'sentido' WHEN 'SUFRIDA' THEN 'ACTIVO' ELSE 'PASIVO' END;
  ELSE
    v_esperado := CASE v_fila->>'clase' WHEN 'IVA_DEBITO' THEN 'PASIVO' WHEN 'IVA_CREDITO' THEN 'ACTIVO'
                                        WHEN 'PERCEPCION_SUFRIDA' THEN 'ACTIVO' ELSE NULL END;
  END IF;
  IF v_esperado IS NOT NULL THEN
    SELECT "tipo" INTO v_tipo FROM "CuentaContable" WHERE "id" = v_fila->>'cuentaId' AND "tenantId" = v_fila->>'tenantId';
    IF v_tipo IS DISTINCT FROM v_esperado THEN
      RAISE EXCEPTION '% %: la cuenta tiene que ser de % (es %)', TG_TABLE_NAME, v_fila->>'codigo', v_esperado, v_tipo
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Conflicto «al guardar»: una clase de asiento activa que exige un dato y una cuenta (de una clase
-- de cuenta que esa clase imputa) cuyo grupo de campos lo suprime.
CREATE OR REPLACE FUNCTION contabilidad_param_conflicto_campos() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_c RECORD;
BEGIN
  PERFORM contabilidad_exigir_tabla(TG_TABLE_SCHEMA, TG_TABLE_NAME, ARRAY['ClaseAsiento', 'GrupoCampos', 'CuentaContable']);
  SELECT ca."codigo" AS "clase", c."codigo" AS "cuenta",
         CASE WHEN ca."exigeCentroCosto" AND g."centroCosto" = 'S'
                   AND c."tipo" IN ('RESULTADO_POSITIVO', 'RESULTADO_NEGATIVO') THEN 'el centro de costo'
              ELSE 'la referencia' END AS "campo"
    INTO v_c
    FROM "ClaseAsiento" ca
    JOIN "CuentaContable" c ON c."tenantId" = ca."tenantId"
    JOIN "GrupoCampos" g ON g."id" = c."grupoCamposId" AND g."tenantId" = c."tenantId"
   WHERE ca."tenantId" = NEW."tenantId" AND ca."activa" AND c."activa"
     AND COALESCE(c."claseCuenta", 'MAYOR') = ANY (ca."clasesCuentaPermitidas")
     AND ((ca."exigeCentroCosto" AND g."centroCosto" = 'S' AND c."tipo" IN ('RESULTADO_POSITIVO', 'RESULTADO_NEGATIVO'))
       OR (ca."exigeReferencia" AND g."referencia" = 'S'))
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Parametrización contradictoria: la clase de asiento % exige % y el grupo de campos de la cuenta % lo suprime',
      v_c."clase", v_c."campo", v_c."cuenta" USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

-- Un campo de la línea según su estado efectivo (el más exigente entre la cuenta y la clase).
CREATE OR REPLACE FUNCTION contabilidad_param_campo(p_estado text, p_exige boolean, p_tiene boolean, p_campo text, p_cuenta text)
  RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF p_exige AND p_estado = 'S' THEN
    RAISE EXCEPTION 'Parametrización contradictoria: la clase de asiento exige % y el grupo de campos de la cuenta % lo suprime',
      p_campo, p_cuenta USING ERRCODE = '23514';
  END IF;
  IF (p_exige OR p_estado = 'R') AND NOT p_tiene THEN
    RAISE EXCEPTION 'Falta % en la línea de la cuenta % (es obligatorio)', p_campo, p_cuenta USING ERRCODE = '23514';
  END IF;
  IF p_estado = 'S' AND p_tiene THEN
    RAISE EXCEPTION 'La cuenta % no admite %', p_cuenta, p_campo USING ERRCODE = '23514';
  END IF;
END $$;

-- Reemplaza el de la parte A: estado de campos, una pasada por las líneas del asiento al confirmar.
CREATE OR REPLACE FUNCTION contabilidad_param_campos(p "Asiento", p_exige_centro boolean, p_exige_referencia boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_l RECORD;
  v_ref boolean := COALESCE(btrim(p."referencia"), '') <> '';
BEGIN
  FOR v_l IN
    SELECT l."centroCostoId", l."detalle", l."moneda", l."fechaOrigen", l."indicadorImpuestoId",
           c."codigo", c."tipo",
           COALESCE(g."centroCosto", 'O') AS "gCentro", COALESCE(g."detalle", 'O') AS "gDetalle",
           COALESCE(g."monedaOrigen", 'O') AS "gMoneda", COALESCE(g."fechaOrigen", 'O') AS "gFecha",
           COALESCE(g."referencia", 'O') AS "gRef", COALESCE(g."indicadorImpuesto", 'O') AS "gIndicador"
      FROM "AsientoLinea" l
      JOIN "CuentaContable" c ON c."id" = l."cuentaId" AND c."tenantId" = l."tenantId"
      LEFT JOIN "GrupoCampos" g ON g."id" = c."grupoCamposId" AND g."tenantId" = c."tenantId"
     WHERE l."tenantId" = p."tenantId" AND l."asientoId" = p."id"
  LOOP
    PERFORM contabilidad_param_campo(v_l."gCentro",
      p_exige_centro AND v_l."tipo" IN ('RESULTADO_POSITIVO', 'RESULTADO_NEGATIVO'),
      v_l."centroCostoId" IS NOT NULL, 'el centro de costo', v_l."codigo");
    PERFORM contabilidad_param_campo(v_l."gDetalle", false, COALESCE(btrim(v_l."detalle"), '') <> '', 'el detalle', v_l."codigo");
    PERFORM contabilidad_param_campo(v_l."gMoneda", false, v_l."moneda" IS NOT NULL, 'la moneda de origen', v_l."codigo");
    PERFORM contabilidad_param_campo(v_l."gFecha", false, v_l."fechaOrigen" IS NOT NULL, 'la fecha de origen', v_l."codigo");
    PERFORM contabilidad_param_campo(v_l."gRef", p_exige_referencia, v_ref, 'la referencia', v_l."codigo");
    PERFORM contabilidad_param_campo(v_l."gIndicador", false, v_l."indicadorImpuestoId" IS NOT NULL, 'el indicador de impuesto', v_l."codigo");
  END LOOP;
END $$;

-- Reemplaza el de la parte A: conversión por línea, en enteros. Por cada línea en moneda de origen,
-- |pesos − redondeo(importeOrigen × cotización / 10^6)| ≤ REDONDEO_CONVERSION_CENTAVOS vigente a la
-- fecha del asiento (sin fila = 0). Una cuenta en moneda extranjera sólo se imputa en esa moneda.
CREATE OR REPLACE FUNCTION contabilidad_param_conversion(p_asiento TEXT, p_tenant TEXT) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fecha date;
  v_funcional text;
  v_tol numeric;
  v_l RECORD;
BEGIN
  SELECT "fecha" INTO v_fecha FROM "Asiento" WHERE "id" = p_asiento AND "tenantId" = p_tenant;
  SELECT "monedaFuncional" INTO v_funcional FROM "ConfigContable" WHERE "tenantId" = p_tenant;
  SELECT "valor" INTO v_tol FROM "Tolerancia"
    WHERE "tenantId" = p_tenant AND "codigo" = 'REDONDEO_CONVERSION_CENTAVOS' AND "vigenteDesde" <= v_fecha
    ORDER BY "vigenteDesde" DESC LIMIT 1;
  v_tol := COALESCE(v_tol, 0);
  SELECT c."codigo", l."moneda", c."monedaCuenta",
         (l."debe" + l."haber") AS "pesos",
         round(l."importeOrigen"::numeric * l."cotizacion" / 1000000) AS "convertido"
    INTO v_l
    FROM "AsientoLinea" l
    JOIN "CuentaContable" c ON c."id" = l."cuentaId" AND c."tenantId" = l."tenantId"
   WHERE l."tenantId" = p_tenant AND l."asientoId" = p_asiento
     AND ((l."moneda" IS NOT NULL
           AND abs((l."debe" + l."haber") - round(l."importeOrigen"::numeric * l."cotizacion" / 1000000)) > v_tol)
       OR (c."monedaCuenta" IS NOT NULL AND c."monedaCuenta" <> v_funcional
           AND l."moneda" IS DISTINCT FROM c."monedaCuenta"))
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_l."monedaCuenta" IS NOT NULL AND v_l."monedaCuenta" <> v_funcional AND v_l."moneda" IS DISTINCT FROM v_l."monedaCuenta" THEN
    RAISE EXCEPTION 'La cuenta % es en %: la línea va en esa moneda, con importe de origen y cotización',
      v_l."codigo", v_l."monedaCuenta" USING ERRCODE = '23514';
  END IF;
  RAISE EXCEPTION 'Conversión de la cuenta %: % centavos en pesos y % convertidos (tolerancia %)',
    v_l."codigo", v_l."pesos", v_l."convertido", v_tol USING ERRCODE = '23514';
END $$;

-- ── Triggers ────────────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER "IndicadorImpuesto_versionada" BEFORE UPDATE ON "IndicadorImpuesto"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_versionada();
CREATE TRIGGER "RegimenRetencion_versionada" BEFORE UPDATE ON "RegimenRetencion"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_versionada();
CREATE TRIGGER "DeterminacionCuenta_versionada" BEFORE UPDATE ON "DeterminacionCuenta"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_versionada();
CREATE TRIGGER "Tolerancia_versionada" BEFORE UPDATE ON "Tolerancia"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_versionada();

CREATE TRIGGER "IndicadorImpuesto_vigencia" BEFORE INSERT OR DELETE ON "IndicadorImpuesto"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_vigencia();
CREATE TRIGGER "RegimenRetencion_vigencia" BEFORE INSERT OR DELETE ON "RegimenRetencion"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_vigencia();
CREATE TRIGGER "DeterminacionCuenta_vigencia" BEFORE INSERT OR DELETE ON "DeterminacionCuenta"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_vigencia();
CREATE TRIGGER "Tolerancia_vigencia" BEFORE INSERT OR DELETE ON "Tolerancia"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_vigencia();

CREATE TRIGGER "IndicadorImpuesto_cuenta" BEFORE INSERT ON "IndicadorImpuesto"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_cuenta_impuesto();
CREATE TRIGGER "RegimenRetencion_cuenta" BEFORE INSERT ON "RegimenRetencion"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_cuenta_impuesto();

CREATE TRIGGER "ClaseAsiento_conflicto_campos" AFTER INSERT OR UPDATE ON "ClaseAsiento"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_conflicto_campos();
CREATE TRIGGER "GrupoCampos_conflicto_campos" AFTER INSERT OR UPDATE ON "GrupoCampos"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_conflicto_campos();
-- Sólo cuentas con grupo de campos (columna nueva): inerte para el plan de cuentas actual.
CREATE TRIGGER "CuentaContable_conflicto_campos" AFTER INSERT OR UPDATE ON "CuentaContable"
  FOR EACH ROW WHEN (NEW."grupoCamposId" IS NOT NULL) EXECUTE FUNCTION contabilidad_param_conflicto_campos();

CREATE TRIGGER "TipoCotizacion_rastro" AFTER INSERT OR UPDATE OR DELETE ON "TipoCotizacion"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "Cotizacion_rastro" AFTER INSERT OR UPDATE OR DELETE ON "Cotizacion"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "IndicadorImpuesto_rastro" AFTER INSERT OR UPDATE OR DELETE ON "IndicadorImpuesto"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "RegimenRetencion_rastro" AFTER INSERT OR UPDATE OR DELETE ON "RegimenRetencion"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "DeterminacionCuenta_rastro" AFTER INSERT OR UPDATE OR DELETE ON "DeterminacionCuenta"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "Tolerancia_rastro" AFTER INSERT OR UPDATE OR DELETE ON "Tolerancia"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();
CREATE TRIGGER "GrupoCampos_rastro" AFTER INSERT OR UPDATE OR DELETE ON "GrupoCampos"
  FOR EACH ROW EXECUTE FUNCTION contabilidad_param_rastro();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner') THEN
    ALTER FUNCTION contabilidad_param_cotizacion() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_versionada() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_cuenta_impuesto() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_conflicto_campos() OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_campo(text, boolean, boolean, text, text) OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_campos("Asiento", boolean, boolean) OWNER TO neondb_owner;
    ALTER FUNCTION contabilidad_param_conversion(TEXT, TEXT) OWNER TO neondb_owner;
  END IF;
END $$;

-- Sin EXECUTE para PUBLIC (ver 20261112120000). 0002 lo repite.
REVOKE EXECUTE ON FUNCTION contabilidad_param_cotizacion() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_versionada() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_cuenta_impuesto() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_conflicto_campos() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_campos("Asiento", boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION contabilidad_param_conversion(TEXT, TEXT) FROM PUBLIC;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE "TipoCotizacion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TipoCotizacion";
CREATE POLICY tenant_isolation ON "TipoCotizacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Cotizacion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Cotizacion";
CREATE POLICY tenant_isolation ON "Cotizacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "IndicadorImpuesto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IndicadorImpuesto";
CREATE POLICY tenant_isolation ON "IndicadorImpuesto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "RegimenRetencion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RegimenRetencion";
CREATE POLICY tenant_isolation ON "RegimenRetencion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "DeterminacionCuenta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DeterminacionCuenta";
CREATE POLICY tenant_isolation ON "DeterminacionCuenta"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Tolerancia" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Tolerancia";
CREATE POLICY tenant_isolation ON "Tolerancia"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "GrupoCampos" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "GrupoCampos";
CREATE POLICY tenant_isolation ON "GrupoCampos"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
