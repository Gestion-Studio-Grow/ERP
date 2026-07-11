-- Módulo BANCOS (plugin src/plugins/bancos + glue src/lib/bancos-*) — persistencia de la
-- importación de extractos bancarios: lote (`ImportacionBancaria`, con el archivo crudo para
-- re-procesar el mapeo confirmado), movimientos con propuesta de factura (`MovimientoImportado`,
-- idempotente por unique [tenantId, hash] — ADR-025 §3) y aprendizaje del clasificador por
-- tenant (`ReglaClasificacionBancoTenant`). Config del módulo en Tenant (`bancos*`, mismo
-- patrón que `arca*` — ADR-022 §5 opción B; nulos = defaults del producto: umbral 600.000,
-- cap 159). Dinero en DECIMAL(14,2) (ADR-057).
--
-- TODO ADITIVO: 4 enums nuevos + 3 tablas nuevas + 3 columnas nullable en Tenant. No toca
-- ninguna tabla/fila viva. Generada con `prisma migrate diff` schema→schema (offline) y
-- verificada local (validate + generate + tsc + tests + aplicación en PGlite); NO aplicada
-- a Neon (Gate 2).
--
-- ⚠️ RLS: ImportacionBancaria, MovimientoImportado y ReglaClasificacionBancoTenant tienen
--    `tenantId` → re-ejecutar `prisma/rls/0001_enable_rls.sql` (data-driven) tras esta
--    migración, en el mismo deploy.

-- CreateEnum
CREATE TYPE "OrigenImportacionBancaria" AS ENUM ('banco', 'mercadopago');

-- CreateEnum
CREATE TYPE "EstadoImportacionBancaria" AS ENUM ('procesada', 'confirmada', 'descartada');

-- CreateEnum
CREATE TYPE "ClasificacionMovimientoBancario" AS ENUM ('venta', 'comision', 'impuesto', 'transferencia_propia', 'reverso', 'prestamo', 'egreso', 'otro');

-- CreateEnum
CREATE TYPE "EstadoPropuestaMovimiento" AS ENUM ('auto', 'revision', 'no_facturable', 'descartado', 'emitida');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "bancosCapFacturasMes" INTEGER,
ADD COLUMN     "bancosDomicilioEmisor" TEXT,
ADD COLUMN     "bancosUmbralIdentificacion" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "ImportacionBancaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "origen" "OrigenImportacionBancaria" NOT NULL,
    "archivo" BYTEA NOT NULL,
    "mapeoJson" JSONB NOT NULL,
    "estado" "EstadoImportacionBancaria" NOT NULL DEFAULT 'procesada',
    "totalMovimientos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacionBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoImportado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "importacionId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "contraparte" TEXT,
    "referencia" TEXT,
    "clasificacion" "ClasificacionMovimientoBancario" NOT NULL,
    "estadoPropuesta" "EstadoPropuestaMovimiento" NOT NULL,
    "requiereIdentificacion" BOOLEAN NOT NULL DEFAULT false,
    "motivoRevision" TEXT,
    "docTipo" INTEGER,
    "docNro" TEXT,
    "nombreReceptor" TEXT,
    "descripcionServicio" TEXT,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MovimientoImportado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaClasificacionBancoTenant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contraparte" TEXT,
    "descripcionNormalizada" TEXT,
    "clasificacion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReglaClasificacionBancoTenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportacionBancaria_tenantId_idx" ON "ImportacionBancaria"("tenantId");

-- CreateIndex
CREATE INDEX "ImportacionBancaria_tenantId_createdAt_idx" ON "ImportacionBancaria"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "MovimientoImportado_tenantId_estadoPropuesta_idx" ON "MovimientoImportado"("tenantId", "estadoPropuesta");

-- CreateIndex
CREATE INDEX "MovimientoImportado_tenantId_importacionId_idx" ON "MovimientoImportado"("tenantId", "importacionId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoImportado_tenantId_hash_key" ON "MovimientoImportado"("tenantId", "hash");

-- CreateIndex
CREATE INDEX "ReglaClasificacionBancoTenant_tenantId_idx" ON "ReglaClasificacionBancoTenant"("tenantId");

-- AddForeignKey
ALTER TABLE "ImportacionBancaria" ADD CONSTRAINT "ImportacionBancaria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoImportado" ADD CONSTRAINT "MovimientoImportado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoImportado" ADD CONSTRAINT "MovimientoImportado_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaClasificacionBancoTenant" ADD CONSTRAINT "ReglaClasificacionBancoTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

