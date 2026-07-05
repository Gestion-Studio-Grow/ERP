-- Alinear Invoice con CORE-SCHEMA-SPEC §1 (ADR-022): campos fiscales aditivos.
-- Escrita a mano y verificada offline (prisma validate); NO aplicada a Neon.
-- Se aplica con `prisma migrate deploy` (Gate 2 — requiere OK). Aditivo/nullable
-- → sin backfill. Va DESPUÉS de 20260704160000_add_invoice_outbox (crea Invoice).
-- NO incluye el cambio Float→Decimal del spec: es decisión de arquitectura (ADR)
-- a coordinar con el PMO, cruza el contrato `number` del plugin ARCA.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "ivaDesglose" JSONB,
ADD COLUMN     "authorizedAt" TIMESTAMP(3);

-- CreateIndex: guarda anti-duplicado de numeración fiscal (tenant, PV, tipo, nº).
-- Las filas PENDING tienen tipoComprobante/numero NULL → Postgres las trata como
-- distintas (NULL nunca es igual a NULL), así que no colisionan entre sí.
CREATE UNIQUE INDEX "Invoice_tenantId_puntoVenta_tipoComprobante_numero_key" ON "Invoice"("tenantId", "puntoVenta", "tipoComprobante", "numero");
