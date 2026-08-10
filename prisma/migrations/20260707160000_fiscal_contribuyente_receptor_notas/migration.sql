-- Ramas de facturación por TIPO DE CONTRIBUYENTE + RG 5616 + notas de crédito
-- (frente/facturacion-arca, ADR-022/024). Campos fiscales ADITIVOS y nullable.
-- Escrita a mano y verificada offline (prisma validate + tsc + build); NO aplicada
-- a Neon. Se aplica con `prisma migrate deploy` (Gate 2 — requiere OK explícito
-- del dueño). Aditivo/nullable → sin backfill. Va DESPUÉS de
-- 20260705150002_fiscal_invoice_align.

-- 1) Condición de IVA del EMISOR por tenant: define la rama de facturación
--    (Monotributo/Exento → Factura C; Responsable Inscripto → A/B). Nullable:
--    sin cargar, el Core cae al perfil provisional (Monotributo).
ALTER TABLE "Tenant" ADD COLUMN "arcaCondicionIva" TEXT;

-- 2) Condición de IVA del RECEPTOR codificada para ARCA (CondicionIVAReceptorId,
--    RG 5616). Se persiste en la factura para auditoría/reimpresión.
ALTER TABLE "Invoice" ADD COLUMN "condicionIvaReceptorId" INTEGER;

-- 3) Soft-link de una nota de crédito a la factura ORIGEN que reversa (el
--    CbtesAsoc real lo arma el plugin ARCA; esto es trazabilidad en el Core).
ALTER TABLE "Invoice" ADD COLUMN "comprobanteAsociadoId" TEXT;
