-- D10 (ADR-060 ajuste 2, fiscal) — Enlace `Invoice → origen` (FK nullable a Order/Appointment).
--
-- Fija de dónde salió cada factura (la venta que la generó). Se agrega AHORA porque hacerlo
-- con facturas reales adentro es la migración fiscal más cara. La idempotencia del webhook
-- deja de depender del parche `Payment.comprobanteNro`.
--
-- ADITIVA: 2 columnas nullable en Invoice (sin default → no reescribe filas; las facturas
-- previas quedan sin origen, válido) + 2 FKs SetNull (borrar el origen no rompe el histórico
-- fiscal). Verificada OFFLINE (validate + generate + migrate diff schema→schema + tsc + tests).
-- NO aplicada a Neon (§C · Gate 2). Invoice ya es tenant-scoped → RLS ya lo cubre.

-- AlterTable (aditiva: columnas nullable)
ALTER TABLE "Invoice" ADD COLUMN     "appointmentId" TEXT,
ADD COLUMN     "orderId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_tenantId_orderId_idx" ON "Invoice"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_appointmentId_idx" ON "Invoice"("tenantId", "appointmentId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
