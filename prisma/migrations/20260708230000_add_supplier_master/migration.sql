-- D1 (ADR-060 Fase C) — Proveedor maestro `Supplier` + FK nullable en `StockPurchase`.
--
-- Prerrequisito (cuello) de compras formal (D6), devoluciones (D4) y cuentas a pagar (D2).
-- ADITIVA y no invasiva: CREATE de una tabla nueva + ADD COLUMN nullable en StockPurchase
-- (las compras existentes quedan con supplierId NULL y su `supplier` texto intacto → sin
-- backfill, ningún dato se pierde). FK a Supplier con SetNull (borrar un proveedor no
-- rompe el histórico de compras).
--
-- Escrita a mano mirroreando `add_stock_ledger`/`add_tenant_profile` y verificada OFFLINE
-- (prisma validate + prisma generate + prisma migrate diff schema→schema + tsc + tests);
-- NO aplicada a Neon. SCHEMA COMPARTIDO → revisión del PMO antes de integrar a main y
-- antes de `prisma migrate deploy` (§C · Gate 2 — requiere OK del owner).
--
-- ⚠️ RLS: `Supplier` es tenant-scoped (tiene `tenantId`). La policy se aplica RE-EJECUTANDO
-- `prisma/rls/0001_enable_rls.sql` (data-driven) tras esta migración, en el mismo deploy.

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_taxId_key" ON "Supplier"("tenantId", "taxId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable (aditiva: columna nullable, sin default → no reescribe filas existentes)
ALTER TABLE "StockPurchase" ADD COLUMN     "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "StockPurchase_tenantId_supplierId_idx" ON "StockPurchase"("tenantId", "supplierId");

-- AddForeignKey
ALTER TABLE "StockPurchase" ADD CONSTRAINT "StockPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
