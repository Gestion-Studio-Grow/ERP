-- Motor de facturación · R1 «una factura por cobro» (docs/producto/motor-facturacion/DIAGNOSTICO.md §R1).
-- Aditiva: una tabla nueva, sin tocar ninguna existente ni datos.
--   · Libro de qué COBRO quedó facturado y en qué comprobante. El índice único (tenantId, clave)
--     hace que la BASE impida facturar dos veces el mismo cobro por dos disparadores distintos
--     (aviso de Mercado Pago, completar el turno, extracto bancario) aunque corran a la vez (DB-4).
--   · Claves: 'mp:<paymentId>', 'turno:<appointmentId>', 'banco:<hash del movimiento>'.
--   · La llave foránea de dos columnas (tenantId, invoiceId) → "Invoice" impide apuntar a una
--     factura de otro negocio. Plata en numeric(14,2) (ADR-100).
-- SIN APLICAR en Neon y fuera de prisma/lote-deploy.txt: se aplica con OK del dueño (Gate 2), DESPUÉS
-- de 20261022140000_invoice_abono_descripcion y 20261022140100_regla_facturacion.
-- RLS viaja con la migración (misma política que prisma/rls/0001_enable_rls.sql).

-- CreateTable
CREATE TABLE "CobroFacturado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CobroFacturado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CobroFacturado_clave_check" CHECK ("clave" ~ '^(mp|turno|banco):.+$'),
    CONSTRAINT "CobroFacturado_importe_check" CHECK ("importe" > 0)
);

-- CreateIndex
CREATE INDEX "CobroFacturado_tenantId_appointmentId_idx" ON "CobroFacturado"("tenantId", "appointmentId");

-- CreateIndex
CREATE INDEX "CobroFacturado_tenantId_invoiceId_idx" ON "CobroFacturado"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CobroFacturado_tenantId_clave_key" ON "CobroFacturado"("tenantId", "clave");

-- AddForeignKey
ALTER TABLE "CobroFacturado" ADD CONSTRAINT "CobroFacturado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CobroFacturado" ADD CONSTRAINT "CobroFacturado_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "Invoice"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS de la tabla nueva (misma política que prisma/rls/0001_enable_rls.sql) ──
ALTER TABLE "CobroFacturado" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CobroFacturado";
CREATE POLICY tenant_isolation ON "CobroFacturado"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
