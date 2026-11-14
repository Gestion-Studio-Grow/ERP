-- Etapa 2 · T2 · facturar una cuota de cobro de un proyecto con ARCA (interruptor
-- `facturacion-proyectos` + módulo `arca`). Aditiva: una columna NULLABLE en "Invoice", un índice
-- único y una llave foránea. No toca ninguna fila existente (las facturas de hoy quedan con NULL, y
-- los NULL no chocan en un índice único de Postgres).
--   · "proyectoCuotaId": origen PROYECTO_CUOTA. El índice único (tenantId, proyectoCuotaId) hace
--     que la BASE impida dos facturas de la misma cuota (carrera → P2002 → createInvoice devuelve
--     la ganadora), como con pedido/turno/pago MP/abono.
--   · Llave foránea ON DELETE SET NULL: borrar la cuota no rompe el histórico fiscal.
-- SIN APLICAR en Neon y fuera de prisma/lote-deploy.txt (Gate 2: lo suma la orquestadora).
-- El código tolera su ausencia: `hayColumnaCuotaEnInvoice()` mira information_schema y, sin la
-- columna, la acción se niega sin escribir («espera su migración») y la ficha no muestra el botón.
-- "Invoice" ya tiene RLS (tenant_isolation, prisma/rls/0001_enable_rls.sql): no cambia.
-- Idempotente (IF NOT EXISTS) para poder correrla dos veces sin daño.

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "proyectoCuotaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_tenantId_proyectoCuotaId_key" ON "Invoice"("tenantId", "proyectoCuotaId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_proyectoCuotaId_fkey'
  ) THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_proyectoCuotaId_fkey"
      FOREIGN KEY ("proyectoCuotaId") REFERENCES "ProyectoCuota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
