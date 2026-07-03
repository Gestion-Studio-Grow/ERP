/*
  Warnings:

  - Made the column `tenantId` on table `Appointment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Box` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `BoxBlock` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Client` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Payment` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Product` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Professional` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Review` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Service` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `ServiceProduct` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `WorkingHours` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Box" DROP CONSTRAINT "Box_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "BoxBlock" DROP CONSTRAINT "BoxBlock_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Professional" DROP CONSTRAINT "Professional_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ServiceProduct" DROP CONSTRAINT "ServiceProduct_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "WorkingHours" DROP CONSTRAINT "WorkingHours_tenantId_fkey";

-- DropIndex
DROP INDEX "AuditLog_createdAt_idx";

-- AlterTable
ALTER TABLE "Appointment" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Box" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "BoxBlock" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Professional" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Service" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ServiceProduct" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "WorkingHours" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Appointment_tenantId_startsAt_idx" ON "Appointment"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Box_tenantId_idx" ON "Box"("tenantId");

-- CreateIndex
CREATE INDEX "BoxBlock_tenantId_idx" ON "BoxBlock"("tenantId");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- CreateIndex
CREATE INDEX "Professional_tenantId_idx" ON "Professional"("tenantId");

-- CreateIndex
CREATE INDEX "Review_tenantId_idx" ON "Review"("tenantId");

-- CreateIndex
CREATE INDEX "Service_tenantId_idx" ON "Service"("tenantId");

-- CreateIndex
CREATE INDEX "ServiceProduct_tenantId_idx" ON "ServiceProduct"("tenantId");

-- CreateIndex
CREATE INDEX "WorkingHours_tenantId_idx" ON "WorkingHours"("tenantId");

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxBlock" ADD CONSTRAINT "BoxBlock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProduct" ADD CONSTRAINT "ServiceProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
