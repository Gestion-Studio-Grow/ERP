-- Localizacion fiscal argentina (ADR-019 + ADR-020) — solo objetos nuevos, aditivo.

CREATE TYPE "CondicionIva" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL', 'NO_CATEGORIZADO');
CREATE TYPE "FiscalAmbiente" AS ENUM ('HOMOLOGACION', 'PRODUCCION');
CREATE TYPE "RegimenIibb" AS ENUM ('LOCAL', 'CONVENIO_MULTILATERAL', 'EXENTO', 'NO_INSCRIPTO');
CREATE TYPE "TipoComprobante" AS ENUM ('FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C');
CREATE TYPE "TipoDocReceptor" AS ENUM ('CUIT', 'CUIL', 'DNI', 'CONSUMIDOR_FINAL');
CREATE TYPE "EstadoFiscal" AS ENUM ('PENDIENTE', 'AUTORIZADO', 'RECHAZADO', 'ERROR');
CREATE TYPE "OutboxEstado" AS ENUM ('PENDIENTE', 'PROCESADO', 'ERROR');
CREATE TABLE "TenantFiscalConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "condicionIva" "CondicionIva" NOT NULL,
    "puntoVenta" INTEGER NOT NULL DEFAULT 1,
    "ambiente" "FiscalAmbiente" NOT NULL DEFAULT 'HOMOLOGACION',
    "connectorRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFiscalConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantJurisdiccion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "jurisdiccion" TEXT NOT NULL,
    "regimen" "RegimenIibb" NOT NULL,
    "nroInscripcion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantJurisdiccion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FiscalDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoComprobante" NOT NULL,
    "puntoVenta" INTEGER NOT NULL,
    "nroComprobante" INTEGER,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "receptorCondicionIva" "CondicionIva" NOT NULL,
    "receptorTipoDoc" "TipoDocReceptor" NOT NULL,
    "receptorNroDoc" TEXT,
    "neto" DOUBLE PRECISION NOT NULL,
    "iva" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoFiscal" NOT NULL DEFAULT 'PENDIENTE',
    "cae" TEXT,
    "caeVencimiento" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "origenTipo" TEXT NOT NULL,
    "origenId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" "OutboxEstado" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesadoAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantFiscalConfig_tenantId_key" ON "TenantFiscalConfig"("tenantId");
CREATE INDEX "TenantFiscalConfig_tenantId_idx" ON "TenantFiscalConfig"("tenantId");
CREATE INDEX "TenantJurisdiccion_tenantId_idx" ON "TenantJurisdiccion"("tenantId");
CREATE INDEX "TenantJurisdiccion_configId_idx" ON "TenantJurisdiccion"("configId");
CREATE UNIQUE INDEX "TenantJurisdiccion_configId_jurisdiccion_key" ON "TenantJurisdiccion"("configId", "jurisdiccion");
CREATE UNIQUE INDEX "FiscalDocument_idempotencyKey_key" ON "FiscalDocument"("idempotencyKey");
CREATE INDEX "FiscalDocument_tenantId_idx" ON "FiscalDocument"("tenantId");
CREATE INDEX "FiscalDocument_tenantId_estado_idx" ON "FiscalDocument"("tenantId", "estado");
CREATE INDEX "OutboxEvent_tenantId_idx" ON "OutboxEvent"("tenantId");
CREATE INDEX "OutboxEvent_estado_idx" ON "OutboxEvent"("estado");
ALTER TABLE "TenantFiscalConfig" ADD CONSTRAINT "TenantFiscalConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantJurisdiccion" ADD CONSTRAINT "TenantJurisdiccion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantJurisdiccion" ADD CONSTRAINT "TenantJurisdiccion_configId_fkey" FOREIGN KEY ("configId") REFERENCES "TenantFiscalConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
