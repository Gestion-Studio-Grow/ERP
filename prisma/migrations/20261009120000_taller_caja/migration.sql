-- Taller → libro de caja. Aditiva: una columna nullable en "CashMovement" (la clave del asiento
-- del cobro de una orden de trabajo) con su índice único, y el rastro de anulación en "TallerPago".
-- No toca filas existentes: en "CashMovement" la columna nace NULL y los NULL no chocan en el único.

ALTER TABLE "TallerPago" ADD COLUMN "anuladoEl" TIMESTAMP(3);
ALTER TABLE "TallerPago" ADD COLUMN "anuladoPor" TEXT;

ALTER TABLE "CashMovement" ADD COLUMN "tallerPagoId" TEXT;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_tallerPagoId_fkey"
  FOREIGN KEY ("tallerPagoId") REFERENCES "TallerPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CashMovement_tenantId_tallerPagoId_type_key" ON "CashMovement"("tenantId", "tallerPagoId", "type");
