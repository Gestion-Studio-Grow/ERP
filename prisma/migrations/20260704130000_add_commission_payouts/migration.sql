-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "appointmentCount" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "settledBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "commissionPayoutId" TEXT;

-- CreateIndex
CREATE INDEX "CommissionPayout_tenantId_createdAt_idx" ON "CommissionPayout"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionPayout_professionalId_idx" ON "CommissionPayout"("professionalId");

-- CreateIndex
CREATE INDEX "Appointment_commissionPayoutId_idx" ON "Appointment"("commissionPayoutId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_commissionPayoutId_fkey" FOREIGN KEY ("commissionPayoutId") REFERENCES "CommissionPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayout" ADD CONSTRAINT "CommissionPayout_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
