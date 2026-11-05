-- Ficha completa del servicio (pedido del dueño de CH, 04/11): precio a definir, tiempo en la
-- agenda, seña en porcentaje, modalidad, tipo, aclaración para el recordatorio y hasta 4 fotos.
-- SÓLO AGREGA: dos enums y dos tablas nuevas. No toca ni una columna ni un dato existente.
-- Va en tablas aparte (y no en columnas de "Service") para que el código funcione igual sin
-- esta migración: una columna nueva en "Service" rompería con P2022 toda lectura sin select.
-- Gate 2: se escribe SIN aplicar.
-- CreateEnum
CREATE TYPE "ServiceModality" AS ENUM ('PRESENCIAL', 'ONLINE', 'DOMICILIO');

-- CreateEnum
CREATE TYPE "ServiceKind" AS ENUM ('REGULAR', 'CUPOS', 'RECURRENTE');

-- CreateTable
CREATE TABLE "ServiceDetail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "priceToDefine" BOOLEAN NOT NULL DEFAULT false,
    "calendarMin" INTEGER,
    "depositPercent" INTEGER,
    "modality" "ServiceModality" NOT NULL DEFAULT 'PRESENCIAL',
    "kind" "ServiceKind" NOT NULL DEFAULT 'REGULAR',
    "reminderNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceFoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "posicion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceFoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceDetail_serviceId_key" ON "ServiceDetail"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceDetail_tenantId_idx" ON "ServiceDetail"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceFoto_tenantId_serviceId_posicion_idx" ON "ServiceFoto"("tenantId", "serviceId", "posicion");

-- AddForeignKey
ALTER TABLE "ServiceDetail" ADD CONSTRAINT "ServiceDetail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceDetail" ADD CONSTRAINT "ServiceDetail_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFoto" ADD CONSTRAINT "ServiceFoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFoto" ADD CONSTRAINT "ServiceFoto_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Topes que la base también hace cumplir (el servidor ya los valida).
ALTER TABLE "ServiceDetail" ADD CONSTRAINT "ServiceDetail_calendarMin_check" CHECK ("calendarMin" IS NULL OR ("calendarMin" > 0 AND "calendarMin" <= 1440));
ALTER TABLE "ServiceDetail" ADD CONSTRAINT "ServiceDetail_depositPercent_check" CHECK ("depositPercent" IS NULL OR ("depositPercent" >= 0 AND "depositPercent" <= 100));
ALTER TABLE "ServiceDetail" ADD CONSTRAINT "ServiceDetail_reminderNote_check" CHECK ("reminderNote" IS NULL OR char_length("reminderNote") <= 280);

-- RLS de las tablas nuevas (misma política que prisma/rls/0001_enable_rls.sql).
ALTER TABLE "ServiceDetail" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ServiceDetail";
CREATE POLICY tenant_isolation ON "ServiceDetail"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ServiceFoto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ServiceFoto";
CREATE POLICY tenant_isolation ON "ServiceFoto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
