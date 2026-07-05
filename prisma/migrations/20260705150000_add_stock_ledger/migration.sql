-- Ledger de stock (StockMovement + enum StockMovementType): la única fuente de verdad
-- de cómo se mueve el inventario. Cada cambio de Product.stock (venta, compra/reposición,
-- consumo de insumo al completar turno, ajuste/merma) escribe una fila acá dentro de la
-- misma transacción que muta el stock. Ver src/lib/stock/ledger.ts (`recordMovement`).
--
-- Escrita a mano mirroreando el patrón de add_stock_purchases y verificada offline
-- (prisma validate + prisma generate + tsc del slice + npm test); NO aplicada a Neon.
-- SCHEMA COMPARTIDO → REVISIÓN DEL PMO antes de integrar a main y antes de
-- `prisma migrate deploy` (Gate 2 — requiere OK del owner).
--
-- Aditiva y no invasiva: solo CREATE de un enum y una tabla nueva + FK débil a Product
-- (SetNull) y FK a Tenant. No toca ninguna columna ni fila de los modelos vivos. Las
-- referencias al origen (orderId/purchaseId/appointmentId) son columnas sueltas SIN FK
-- a propósito (audit trail), para no acoplar el ledger a Order/StockPurchase/Appointment.

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('VENTA', 'COMPRA', 'REPOSICION', 'CONSUMO', 'AJUSTE');

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "orderId" TEXT,
    "purchaseId" TEXT,
    "appointmentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_productId_createdAt_idx" ON "StockMovement"("tenantId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_createdAt_idx" ON "StockMovement"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
