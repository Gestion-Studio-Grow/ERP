-- D3 (ADR-060 Fase E) — Cuentas a COBRAR / fiado `AccountReceivable`.
--
-- Deuda del cliente (FK a Client) que se cobra con `Collection`(originType=RECEIVABLE), en
-- cobros parciales contra el saldo. El saldo = amount − suma de Collections (fuente de verdad
-- única). Comercio: fiado light (dueDate null → aging NO_DUE_DATE); Empresa: con vencimiento.
--
-- Reusa el enum `DebtStatus` creado por la migración D2 (add_account_payable) → esta migración
-- debe aplicarse DESPUÉS (el orden lexicográfico lo garantiza: 000100 > 000000).
--
-- TODO ADITIVO: 1 tabla nueva + FKs. No toca ninguna tabla/fila viva. FK a Client RESTRICT
-- (no borrar un cliente con fiado vivo). Verificada OFFLINE (validate + generate + migrate diff
-- schema→schema + tsc + tests); NO aplicada a Neon (§C · Gate 2).
-- ⚠️ RLS: AccountReceivable tiene `tenantId` → re-ejecutar `prisma/rls/0001_enable_rls.sql`
--    (data-driven) tras esta migración, en el mismo deploy.

-- CreateTable
CREATE TABLE "AccountReceivable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "concept" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "orderId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountReceivable_tenantId_status_idx" ON "AccountReceivable"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AccountReceivable_tenantId_clientId_idx" ON "AccountReceivable"("tenantId", "clientId");

-- CreateIndex
CREATE INDEX "AccountReceivable_tenantId_dueDate_idx" ON "AccountReceivable"("tenantId", "dueDate");

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
