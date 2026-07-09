-- D9 (ADR-060 Fase C.5) — Cobranza/settlement unificado `Collection` (+ enum origen).
--
-- El hueco crítico que marcó la revisión de Opus: cobros PARCIALES contra un saldo. Hoy
-- servicios cobran con `Payment` (1:1) y retail con `Order.paid` (booleano) — ninguno
-- soporta parciales, que es lo que el fiado necesita. `Collection` registra cada cobro
-- contra un origen polimórfico (Order|Appointment|AccountReceivable); el saldo es la suma.
--
-- ENTIDAD NUEVA a propósito (no se muta `Payment`) → 100% ADITIVA: no toca ninguna tabla
-- ni fila viva. FKs nullable a Order/Appointment (SetNull: borrar el origen no rompe el
-- histórico de cobros); RECEIVABLE (D3, aún sin tabla) viaja por `originId`.
--
-- Verificada OFFLINE (validate + generate + migrate diff schema→schema + tsc + tests). NO
-- aplicada a Neon (§C · Gate 2). ⚠️ RLS: tiene `tenantId` → re-ejecutar
-- `prisma/rls/0001_enable_rls.sql` tras esta migración (data-driven), en el mismo deploy.

-- CreateEnum
CREATE TYPE "CollectionOriginType" AS ENUM ('ORDER', 'APPOINTMENT', 'RECEIVABLE');

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "originType" "CollectionOriginType" NOT NULL,
    "originId" TEXT NOT NULL,
    "orderId" TEXT,
    "appointmentId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "collectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_tenantId_originType_originId_idx" ON "Collection"("tenantId", "originType", "originId");

-- CreateIndex
CREATE INDEX "Collection_tenantId_createdAt_idx" ON "Collection"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
