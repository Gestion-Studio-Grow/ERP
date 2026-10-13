-- Módulo INMOBILIARIA: propiedades, fotos, consultas, contratos de alquiler, ajustes, cuotas,
-- cobros, liquidaciones al propietario, índices y configuración.
-- Aditiva: sólo diez tablas nuevas. No agrega, cambia ni borra ninguna columna de las tablas que
-- ya existen, y no toca datos de ningún negocio.
-- Plata en numeric(14,2) desde el día uno (ADR-100). Sin aplicar en Neon: no está en
-- prisma/lote-deploy.txt hasta que el dueño lo decida.

-- CreateTable
CREATE TABLE "InmoPropiedad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "tipo" TEXT NOT NULL DEFAULT 'DEPARTAMENTO',
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "destacada" BOOLEAN NOT NULL DEFAULT false,
    "enVenta" BOOLEAN NOT NULL DEFAULT false,
    "precioVenta" DECIMAL(14,2),
    "monedaVenta" TEXT NOT NULL DEFAULT 'USD',
    "enAlquiler" BOOLEAN NOT NULL DEFAULT false,
    "precioAlquiler" DECIMAL(14,2),
    "monedaAlquiler" TEXT NOT NULL DEFAULT 'ARS',
    "expensas" DECIMAL(14,2),
    "aptoCredito" BOOLEAN NOT NULL DEFAULT false,
    "aptoMascotas" BOOLEAN NOT NULL DEFAULT false,
    "direccion" TEXT NOT NULL DEFAULT '',
    "mostrarDireccion" BOOLEAN NOT NULL DEFAULT true,
    "barrio" TEXT NOT NULL DEFAULT '',
    "localidad" TEXT NOT NULL DEFAULT '',
    "partido" TEXT NOT NULL DEFAULT '',
    "provincia" TEXT NOT NULL DEFAULT 'Buenos Aires',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "ambientes" INTEGER,
    "dormitorios" INTEGER,
    "banos" INTEGER,
    "cocheras" INTEGER,
    "supCubierta" DOUBLE PRECISION,
    "supTotal" DOUBLE PRECISION,
    "antiguedad" INTEGER,
    "comodidades" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT,
    "propietarioId" TEXT,
    "captadaPorUserId" TEXT,
    "notasInternas" TEXT,
    "publicadaEl" TIMESTAMP(3),
    "precioAnterior" DECIMAL(14,2),
    "bajoDePrecioEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InmoPropiedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoFoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propiedadId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "posicion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InmoFoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoConsulta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propiedadId" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'CONSULTA',
    "origen" TEXT NOT NULL DEFAULT 'WEB',
    "estado" TEXT NOT NULL DEFAULT 'NUEVA',
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "mensaje" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,
    "asignadaUserId" TEXT,
    "asignadaNombre" TEXT,
    "visitaEl" TIMESTAMP(3),
    "notas" TEXT,
    "respondidaEl" TIMESTAMP(3),
    "cerradaEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InmoConsulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoContrato" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "propiedadId" TEXT NOT NULL,
    "inquilinoId" TEXT NOT NULL,
    "propietarioId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'VIGENTE',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "montoInicial" DECIMAL(14,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "diaVencimiento" INTEGER NOT NULL DEFAULT 10,
    "ajusteIndice" TEXT NOT NULL DEFAULT 'ICL',
    "ajusteCadaMeses" INTEGER NOT NULL DEFAULT 6,
    "ajusteFijoPct" DOUBLE PRECISION,
    "tramosAplicados" INTEGER NOT NULL DEFAULT 0,
    "comisionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "punitorioDiarioPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deposito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "garantia" TEXT,
    "notas" TEXT,
    "tokenInquilino" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InmoContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoAjuste" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "tramo" INTEGER NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "indice" TEXT NOT NULL,
    "coeficiente" DOUBLE PRECISION NOT NULL,
    "montoAnterior" DECIMAL(14,2) NOT NULL,
    "montoNuevo" DECIMAL(14,2) NOT NULL,
    "detalle" TEXT NOT NULL DEFAULT '',
    "aplicadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InmoAjuste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoCuota" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "periodo" TEXT NOT NULL,
    "vence" TIMESTAMP(3) NOT NULL,
    "tramo" INTEGER NOT NULL DEFAULT 0,
    "alquiler" DECIMAL(14,2) NOT NULL,
    "ajustePendiente" BOOLEAN NOT NULL DEFAULT false,
    "extras" JSONB,
    "punitorios" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "anulada" BOOLEAN NOT NULL DEFAULT false,
    "liquidado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InmoCuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoPago" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "medio" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "nota" TEXT,
    "cobradoPor" TEXT,
    "anuladoEl" TIMESTAMP(3),
    "anuladoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InmoPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoLiquidacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "propietarioId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'EMITIDA',
    "alquileres" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "extras" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "punitorios" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "comision" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ivaComision" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gastos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "neto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "detalle" JSONB,
    "token" TEXT NOT NULL,
    "pagadaEl" TIMESTAMP(3),
    "medio" TEXT,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InmoLiquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoIndice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "indice" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InmoIndice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InmoConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prefijoCodigo" TEXT NOT NULL DEFAULT 'PRO',
    "comisionAdminPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ivaComisionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "punitorioDiarioPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "punitoriosAlPropietario" BOOLEAN NOT NULL DEFAULT true,
    "aliasCbu" TEXT,
    "linkMercadoPago" TEXT,
    "matricula" TEXT,
    "plantillas" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InmoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InmoPropiedad_tenantId_estado_idx" ON "InmoPropiedad"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "InmoPropiedad_tenantId_localidad_idx" ON "InmoPropiedad"("tenantId", "localidad");

-- CreateIndex
CREATE UNIQUE INDEX "InmoPropiedad_tenantId_codigo_key" ON "InmoPropiedad"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "InmoPropiedad_tenantId_slug_key" ON "InmoPropiedad"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "InmoFoto_tenantId_propiedadId_posicion_idx" ON "InmoFoto"("tenantId", "propiedadId", "posicion");

-- CreateIndex
CREATE INDEX "InmoConsulta_tenantId_estado_idx" ON "InmoConsulta"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "InmoConsulta_tenantId_createdAt_idx" ON "InmoConsulta"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "InmoConsulta_tenantId_propiedadId_idx" ON "InmoConsulta"("tenantId", "propiedadId");

-- CreateIndex
CREATE UNIQUE INDEX "InmoContrato_tokenInquilino_key" ON "InmoContrato"("tokenInquilino");

-- CreateIndex
CREATE INDEX "InmoContrato_tenantId_estado_idx" ON "InmoContrato"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "InmoContrato_tenantId_propietarioId_idx" ON "InmoContrato"("tenantId", "propietarioId");

-- CreateIndex
CREATE INDEX "InmoContrato_tenantId_inquilinoId_idx" ON "InmoContrato"("tenantId", "inquilinoId");

-- CreateIndex
CREATE INDEX "InmoContrato_tenantId_propiedadId_idx" ON "InmoContrato"("tenantId", "propiedadId");

-- CreateIndex
CREATE UNIQUE INDEX "InmoContrato_tenantId_numero_key" ON "InmoContrato"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "InmoAjuste_tenantId_contratoId_tramo_key" ON "InmoAjuste"("tenantId", "contratoId", "tramo");

-- CreateIndex
CREATE INDEX "InmoCuota_tenantId_vence_idx" ON "InmoCuota"("tenantId", "vence");

-- CreateIndex
CREATE UNIQUE INDEX "InmoCuota_tenantId_contratoId_periodo_key" ON "InmoCuota"("tenantId", "contratoId", "periodo");

-- CreateIndex
CREATE INDEX "InmoPago_tenantId_cuotaId_idx" ON "InmoPago"("tenantId", "cuotaId");

-- CreateIndex
CREATE INDEX "InmoPago_tenantId_createdAt_idx" ON "InmoPago"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InmoLiquidacion_token_key" ON "InmoLiquidacion"("token");

-- CreateIndex
CREATE INDEX "InmoLiquidacion_tenantId_propietarioId_idx" ON "InmoLiquidacion"("tenantId", "propietarioId");

-- CreateIndex
CREATE INDEX "InmoLiquidacion_tenantId_periodo_idx" ON "InmoLiquidacion"("tenantId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "InmoLiquidacion_tenantId_numero_key" ON "InmoLiquidacion"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "InmoIndice_tenantId_indice_fecha_key" ON "InmoIndice"("tenantId", "indice", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "InmoConfig_tenantId_key" ON "InmoConfig"("tenantId");

-- AddForeignKey
ALTER TABLE "InmoPropiedad" ADD CONSTRAINT "InmoPropiedad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoPropiedad" ADD CONSTRAINT "InmoPropiedad_propietarioId_fkey" FOREIGN KEY ("propietarioId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoFoto" ADD CONSTRAINT "InmoFoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoFoto" ADD CONSTRAINT "InmoFoto_propiedadId_fkey" FOREIGN KEY ("propiedadId") REFERENCES "InmoPropiedad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoConsulta" ADD CONSTRAINT "InmoConsulta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoConsulta" ADD CONSTRAINT "InmoConsulta_propiedadId_fkey" FOREIGN KEY ("propiedadId") REFERENCES "InmoPropiedad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoConsulta" ADD CONSTRAINT "InmoConsulta_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoContrato" ADD CONSTRAINT "InmoContrato_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoContrato" ADD CONSTRAINT "InmoContrato_propiedadId_fkey" FOREIGN KEY ("propiedadId") REFERENCES "InmoPropiedad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoContrato" ADD CONSTRAINT "InmoContrato_inquilinoId_fkey" FOREIGN KEY ("inquilinoId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoContrato" ADD CONSTRAINT "InmoContrato_propietarioId_fkey" FOREIGN KEY ("propietarioId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoAjuste" ADD CONSTRAINT "InmoAjuste_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoAjuste" ADD CONSTRAINT "InmoAjuste_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "InmoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoCuota" ADD CONSTRAINT "InmoCuota_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoCuota" ADD CONSTRAINT "InmoCuota_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "InmoContrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoPago" ADD CONSTRAINT "InmoPago_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoPago" ADD CONSTRAINT "InmoPago_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "InmoCuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoLiquidacion" ADD CONSTRAINT "InmoLiquidacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoLiquidacion" ADD CONSTRAINT "InmoLiquidacion_propietarioId_fkey" FOREIGN KEY ("propietarioId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoIndice" ADD CONSTRAINT "InmoIndice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InmoConfig" ADD CONSTRAINT "InmoConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Monedas (ADR-100 §5) ──────────────────────────────────────────────────────────────────
-- El precio de cartel puede estar en pesos o en dólares: es un precio de lista.
ALTER TABLE "InmoPropiedad" ADD CONSTRAINT "InmoPropiedad_monedas_check"
  CHECK ("monedaVenta" IN ('ARS', 'USD') AND "monedaAlquiler" IN ('ARS', 'USD'));
-- Los contratos administrados, sólo en pesos: cobrar y liquidar en dólares es operar otra
-- moneda y pide su propia decisión. Mientras exista este CHECK, las cuotas, los cobros y las
-- liquidaciones (que no llevan columna de moneda) son pesos sin ambigüedad.
ALTER TABLE "InmoContrato" ADD CONSTRAINT "InmoContrato_moneda_check" CHECK ("moneda" = 'ARS');

-- ── RLS de las tablas nuevas (misma política que prisma/rls/0001_enable_rls.sql) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'InmoPropiedad', 'InmoFoto', 'InmoConsulta', 'InmoContrato', 'InmoAjuste',
    'InmoCuota', 'InmoPago', 'InmoLiquidacion', 'InmoIndice', 'InmoConfig'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
      || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      t
    );
  END LOOP;
END $$;
