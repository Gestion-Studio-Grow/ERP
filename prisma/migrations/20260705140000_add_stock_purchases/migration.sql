-- Capability COMPRAS / REPOSICIÓN de stock del POS (StockPurchase, StockPurchaseItem).
-- Contracara de la venta: la venta descuenta stock (order-core.ts), la compra/reposición
-- lo repone (INCREMENT atómico por producto). Ver src/lib/stock/purchase-core.ts (núcleo
-- + aritmética pura) y src/lib/stock-actions.ts (server actions scoped por tenant).
--
-- Escrita a mano mirroreando el patrón de add_cash_register y verificada offline
-- (prisma validate + prisma generate + tsc + npm test + build); NO aplicada a Neon.
-- Se aplica con `prisma migrate deploy` (Gate 2 — requiere OK del owner).
--
-- Aditiva y no invasiva: solo CREATE de un enum y dos tablas nuevas + FKs hacia
-- tablas existentes (Tenant, Product). No toca ninguna columna ni fila de los modelos
-- vivos, así el tenant spa y el resto del schema siguen idénticos.

-- CreateEnum
CREATE TYPE "StockPurchaseKind" AS ENUM ('COMPRA', 'REPOSICION');

-- CreateTable
CREATE TABLE "StockPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" INTEGER NOT NULL,
    "kind" "StockPurchaseKind" NOT NULL DEFAULT 'COMPRA',
    "supplier" TEXT,
    "notes" TEXT,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPurchaseItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unidades',
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "StockPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockPurchase_tenantId_createdAt_idx" ON "StockPurchase"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockPurchase_tenantId_code_key" ON "StockPurchase"("tenantId", "code");

-- CreateIndex
CREATE INDEX "StockPurchaseItem_tenantId_idx" ON "StockPurchaseItem"("tenantId");

-- CreateIndex
CREATE INDEX "StockPurchaseItem_purchaseId_idx" ON "StockPurchaseItem"("purchaseId");

-- AddForeignKey
ALTER TABLE "StockPurchase" ADD CONSTRAINT "StockPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPurchaseItem" ADD CONSTRAINT "StockPurchaseItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPurchaseItem" ADD CONSTRAINT "StockPurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "StockPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPurchaseItem" ADD CONSTRAINT "StockPurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
