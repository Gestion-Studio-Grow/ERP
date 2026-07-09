-- D2 (ADR-060 Fase D) — Cuentas a PAGAR `AccountPayable` + cheque diferido `PayableCheque`.
--
-- Deuda a proveedor (FK a Supplier D1) que se cancela con `Collection`(originType=PAYABLE):
-- por eso se agrega ese valor al enum. El saldo = amount − suma de Collections (fuente de
-- verdad única, sin campo cacheado); el cheque que ACREDITA genera el Collection que baja el
-- saldo. Aging desde `dueDate` (lógica pura en src/lib/debts/aging.ts).
--
-- TODO ADITIVO: 2 enums nuevos + 1 valor de enum + 2 tablas nuevas + FKs. No toca ninguna
-- tabla/fila viva. FK a Supplier RESTRICT (no borrar un proveedor con deuda); cheque CASCADE
-- (borrar la deuda borra sus cheques). Verificada OFFLINE (validate + generate + migrate diff
-- schema→schema + tsc + tests); NO aplicada a Neon (§C · Gate 2).
--
-- ⚠️ El `ALTER TYPE ... ADD VALUE` requiere PostgreSQL 12+ (Neon es 15/16 → OK). El valor no
--    se USA en esta misma transacción (solo lo usan filas de Collection en runtime) → seguro.
-- ⚠️ RLS: AccountPayable y PayableCheque tienen `tenantId` → re-ejecutar
--    `prisma/rls/0001_enable_rls.sql` (data-driven) tras esta migración, en el mismo deploy.

-- AlterEnum
ALTER TYPE "CollectionOriginType" ADD VALUE 'PAYABLE';

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'VOID');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PENDING', 'DELIVERED', 'CLEARED', 'BOUNCED', 'CANCELED');

-- CreateTable
CREATE TABLE "AccountPayable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "concept" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "purchaseId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayableCheque" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payableId" TEXT NOT NULL,
    "chequeNumber" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'PENDING',
    "endorsedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayableCheque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountPayable_tenantId_status_idx" ON "AccountPayable"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccountPayable_tenantId_supplierId_idx" ON "AccountPayable"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "AccountPayable_tenantId_dueDate_idx" ON "AccountPayable"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "PayableCheque_tenantId_payableId_idx" ON "PayableCheque"("tenantId", "payableId");

-- CreateIndex
CREATE INDEX "PayableCheque_tenantId_status_dueDate_idx" ON "PayableCheque"("tenantId", "status", "dueDate");

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableCheque" ADD CONSTRAINT "PayableCheque_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableCheque" ADD CONSTRAINT "PayableCheque_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "AccountPayable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
