-- Motor de facturación · pedidos 2 y 5 de la consola del contador (docs/producto/contador/PEDIDOS-AL-MOTOR.md).
-- Aditiva: dos columnas NULLABLE en "Invoice" y un índice único. No toca ninguna fila existente
-- (las facturas de hoy quedan con NULL, y los NULL no chocan en un índice único de Postgres).
--   · "abonoClave": origen ABONO = '<reglaId>:<AAAA-MM>'. El índice único (tenantId, abonoClave)
--     hace que la BASE impida dos facturas del mismo abono en el mismo mes (DB-4), venga por
--     donde venga el pedido; createInvoice devuelve la existente (como con pedido/turno/pago MP).
--   · "descripcion": qué se factura («Honorarios de octubre»), para el PDF y el CSV.
-- SIN APLICAR en Neon y fuera de prisma/lote-deploy.txt: se aplica con OK del dueño (Gate 2).
-- "Invoice" ya tiene RLS (tenant_isolation, prisma/rls/0001_enable_rls.sql): no cambia.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "abonoClave" TEXT,
ADD COLUMN "descripcion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_abonoClave_key" ON "Invoice"("tenantId", "abonoClave");
