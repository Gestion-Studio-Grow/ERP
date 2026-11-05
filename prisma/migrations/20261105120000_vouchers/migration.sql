-- Vouchers de CH Estética (La Alameda) y conciliación con OpenKey (docs/tenants/ch/VOUCHERS-OPENKEY.md).
-- Sólo agrega tablas; no toca datos existentes. Gate 2: escrita, SIN aplicar.
-- El valor PaymentMethod.VOUCHER NO va acá (un ADD VALUE es irreversible y no puede usarse en la misma
-- transacción): va en prisma/pending-gate2/CH_voucher_enum.sql. Estas tablas no dependen de él.

-- CreateTable
CREATE TABLE "VoucherLote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherLote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "loteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'DISPONIBLE',
    "appointmentId" TEXT,
    "collectionId" TEXT,
    "valorCubierto" DECIMAL(14,2),
    "usadoEn" TIMESTAMP(3),
    "usadoPor" TEXT,
    "estadoOpenKey" TEXT,
    "fotoOpenKeyEn" TIMESTAMP(3),
    "bajaOpenKeyEn" TIMESTAMP(3),
    "anuladoMotivo" TEXT,
    "liquidadoEn" TIMESTAMP(3),
    "montoLiquidado" DECIMAL(14,2),
    "liquidacionRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherConciliacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origen" TEXT NOT NULL,
    "resumen" JSONB NOT NULL,
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherConciliacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoucherLote_tenantId_numero_key" ON "VoucherLote"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_appointmentId_key" ON "Voucher"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_collectionId_key" ON "Voucher"("collectionId");

-- CreateIndex
CREATE INDEX "Voucher_tenantId_estado_idx" ON "Voucher"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Voucher_tenantId_loteId_idx" ON "Voucher"("tenantId", "loteId");

-- CreateIndex
CREATE INDEX "Voucher_tenantId_clientId_idx" ON "Voucher"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_tenantId_numero_key" ON "Voucher"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "VoucherConciliacion_tenantId_fecha_idx" ON "VoucherConciliacion"("tenantId", "fecha");

-- AddForeignKey
ALTER TABLE "VoucherLote" ADD CONSTRAINT "VoucherLote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "VoucherLote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherConciliacion" ADD CONSTRAINT "VoucherConciliacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Valores cerrados (TEXT + CHECK: un enum en Neon es irreversible).
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_estado_check" CHECK ("estado" IN ('DISPONIBLE', 'USADO', 'ANULADO'));
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_estadoOpenKey_check" CHECK ("estadoOpenKey" IS NULL OR "estadoOpenKey" IN ('DISPONIBLE', 'BAJA'));
-- Sólo un voucher USADO puede estar pegado a un turno o a un cobro (borrados → NULL por SET NULL).
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_turno_solo_usado_check" CHECK ("appointmentId" IS NULL OR "estado" = 'USADO');
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_cobro_solo_usado_check" CHECK ("collectionId" IS NULL OR "estado" = 'USADO');
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_valorCubierto_check" CHECK ("valorCubierto" IS NULL OR "valorCubierto" > 0);
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_montoLiquidado_check" CHECK ("montoLiquidado" IS NULL OR "montoLiquidado" >= 0);
ALTER TABLE "VoucherLote" ADD CONSTRAINT "VoucherLote_cantidad_check" CHECK ("cantidad" >= 0);
ALTER TABLE "VoucherConciliacion" ADD CONSTRAINT "VoucherConciliacion_origen_check" CHECK ("origen" IN ('MANUAL', 'RPA'));

-- RLS: aislamiento por negocio (mismo molde que 20261102120000_consultas).
ALTER TABLE "VoucherLote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VoucherLote";
CREATE POLICY tenant_isolation ON "VoucherLote"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Voucher" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Voucher";
CREATE POLICY tenant_isolation ON "Voucher"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "VoucherConciliacion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VoucherConciliacion";
CREATE POLICY tenant_isolation ON "VoucherConciliacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
