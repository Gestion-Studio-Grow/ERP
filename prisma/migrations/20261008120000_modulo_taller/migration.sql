-- Módulo TALLER: vehículos, órdenes de trabajo, presupuesto ítem por ítem, fotos, cobros,
-- configuración y avisos. Aditiva: sólo tablas nuevas y dos columnas con default en "Client".
-- No toca datos de ningún negocio existente.

ALTER TABLE "Client" ADD COLUMN "tallerEtiquetas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Client" ADD COLUMN "tallerCtaCte" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TallerVehiculo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "patente" TEXT NOT NULL,
  "marca" TEXT NOT NULL DEFAULT '',
  "modelo" TEXT NOT NULL DEFAULT '',
  "anio" INTEGER,
  "color" TEXT,
  "km" INTEGER,
  "vtvVence" TIMESTAMP(3),
  "proximoServiceFecha" TIMESTAMP(3),
  "proximoServiceKm" INTEGER,
  "notas" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TallerVehiculo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TallerVehiculo_tenantId_patente_key" ON "TallerVehiculo"("tenantId", "patente");
CREATE INDEX "TallerVehiculo_tenantId_clientId_idx" ON "TallerVehiculo"("tenantId", "clientId");

CREATE TABLE "TallerOrden" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "vehiculoId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'RECIBIDO',
  "km" INTEGER,
  "combustible" INTEGER,
  "problema" TEXT NOT NULL DEFAULT '',
  "diagnostico" TEXT,
  "mecanicoUserId" TEXT,
  "mecanicoNombre" TEXT,
  "horas" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "token" TEXT NOT NULL,
  "firmaIngreso" TEXT,
  "firmaNombre" TEXT,
  "presupuestoEnviadoEl" TIMESTAMP(3),
  "presupuestoValidoHasta" TIMESTAMP(3),
  "presupuestoRespondidoEl" TIMESTAMP(3),
  "entregadoEl" TIMESTAMP(3),
  "garantiaHasta" TIMESTAMP(3),
  "garantiaDetalle" TEXT,
  "resenaPedidaEl" TIMESTAMP(3),
  "comprobanteTipo" TEXT,
  "invoiceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TallerOrden_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TallerOrden_token_key" ON "TallerOrden"("token");
CREATE UNIQUE INDEX "TallerOrden_tenantId_numero_key" ON "TallerOrden"("tenantId", "numero");
CREATE INDEX "TallerOrden_tenantId_estado_idx" ON "TallerOrden"("tenantId", "estado");
CREATE INDEX "TallerOrden_tenantId_vehiculoId_idx" ON "TallerOrden"("tenantId", "vehiculoId");
CREATE INDEX "TallerOrden_tenantId_clientId_idx" ON "TallerOrden"("tenantId", "clientId");

CREATE TABLE "TallerItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ordenId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "costo" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "productId" TEXT,
  "traidoPorCliente" BOOLEAN NOT NULL DEFAULT false,
  "decision" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "posicion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallerItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TallerItem_tenantId_ordenId_idx" ON "TallerItem"("tenantId", "ordenId");

CREATE TABLE "TallerFoto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ordenId" TEXT NOT NULL,
  "momento" TEXT NOT NULL DEFAULT 'INGRESO',
  "datos" TEXT NOT NULL,
  "visibleCliente" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallerFoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TallerFoto_tenantId_ordenId_idx" ON "TallerFoto"("tenantId", "ordenId");

CREATE TABLE "TallerPago" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ordenId" TEXT NOT NULL,
  "medio" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "recargo" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cuotas" INTEGER NOT NULL DEFAULT 1,
  "nota" TEXT,
  "cobradoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallerPago_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TallerPago_tenantId_ordenId_idx" ON "TallerPago"("tenantId", "ordenId");
CREATE INDEX "TallerPago_tenantId_createdAt_idx" ON "TallerPago"("tenantId", "createdAt");

CREATE TABLE "TallerConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "margenPct" DOUBLE PRECISION NOT NULL DEFAULT 35,
  "validezDias" INTEGER NOT NULL DEFAULT 7,
  "garantiaDias" INTEGER NOT NULL DEFAULT 90,
  "valorHora" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "aliasCbu" TEXT,
  "linkMercadoPago" TEXT,
  "linkResena" TEXT,
  "condicionIva" TEXT NOT NULL DEFAULT 'MONOTRIBUTO',
  "recargos" JSONB,
  "plantillas" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TallerConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TallerConfig_tenantId_key" ON "TallerConfig"("tenantId");

CREATE TABLE "TallerAvisoEnviado" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "enviadoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallerAvisoEnviado_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TallerAvisoEnviado_tenantId_clave_key" ON "TallerAvisoEnviado"("tenantId", "clave");

ALTER TABLE "TallerVehiculo" ADD CONSTRAINT "TallerVehiculo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerVehiculo" ADD CONSTRAINT "TallerVehiculo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerOrden" ADD CONSTRAINT "TallerOrden_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerOrden" ADD CONSTRAINT "TallerOrden_vehiculoId_fkey" FOREIGN KEY ("vehiculoId") REFERENCES "TallerVehiculo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerOrden" ADD CONSTRAINT "TallerOrden_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerItem" ADD CONSTRAINT "TallerItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerItem" ADD CONSTRAINT "TallerItem_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "TallerOrden"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerFoto" ADD CONSTRAINT "TallerFoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerFoto" ADD CONSTRAINT "TallerFoto_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "TallerOrden"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerPago" ADD CONSTRAINT "TallerPago_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerPago" ADD CONSTRAINT "TallerPago_ordenId_fkey" FOREIGN KEY ("ordenId") REFERENCES "TallerOrden"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerConfig" ADD CONSTRAINT "TallerConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerAvisoEnviado" ADD CONSTRAINT "TallerAvisoEnviado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS de las tablas nuevas (misma política que prisma/rls/0001_enable_rls.sql) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'TallerVehiculo', 'TallerOrden', 'TallerItem', 'TallerFoto', 'TallerPago',
    'TallerConfig', 'TallerAvisoEnviado'
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
