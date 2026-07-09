-- ROLLBACK de D10 (add_invoice_origin). Manual (§C). Orden inverso.
-- Revierte solo las 2 columnas de enlace; no toca la identidad fiscal de la factura.

ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_orderId_fkey";
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_appointmentId_fkey";
DROP INDEX IF EXISTS "Invoice_tenantId_orderId_idx";
DROP INDEX IF EXISTS "Invoice_tenantId_appointmentId_idx";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "orderId";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "appointmentId";
