-- =============================================================================
-- ENSAYO DE LA MIGRACIÓN — sólo en un BRANCH de Neon, NUNCA en producción.
-- =============================================================================
-- GENERADO por scripts/ensayo-lote-neon.mjs desde prisma/lote-deploy.txt. No editar a mano.
--
-- Cómo: Neon → Branches → Create branch (desde producción, nombre "ensayo-lote") →
-- SQL Editor → elegí el branch "ensayo-lote" arriba → pegá TODO → Run.
-- Aplica las 1 migraciones en UNA transacción y las registra en _prisma_migrations con el
-- checksum de Prisma. Si algo falla no queda nada a medias, y el error dice qué migración.
-- Después: pegá 2-rls-despues-del-lote.sql (el aislamiento entre negocios, data-driven).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261108140000_voucher_liquidacion_semanal')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261108140000_voucher_liquidacion_semanal · checksum d1a3a67b65cb74551cd79e0aa009f2dd0ee16c779183100851a8fee02186df2d ───
-- Vouchers de CH Estética (La Alameda): liquidación del lunes y cuenta corriente de la administración
-- del country (regla del dueño del 08/11/2026, src/lib/vouchers/liquidacion-core.ts).
-- ADITIVA: dos tablas nuevas con RLS y dos columnas NULLABLE en "Voucher" (sin default, sin backfill).
-- No toca datos existentes ni enums. Vuelta atrás: borrar las dos columnas y las dos tablas.

-- CreateTable
CREATE TABLE "VoucherLiquidacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "desde" TEXT NOT NULL,
    "hasta" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pagado" DECIMAL(14,2),
    "diferencia" DECIMAL(14,2),
    "pagoFecha" TEXT,
    "pagoMedio" TEXT,
    "pagoReferencia" TEXT,
    "nota" TEXT,
    "creadoPor" TEXT,
    "conciliadoPor" TEXT,
    "conciliadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherLiquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherPagoAdministracion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "medio" TEXT NOT NULL,
    "referencia" TEXT,
    "nota" TEXT,
    "liquidacionId" TEXT,
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherPagoAdministracion_pkey" PRIMARY KEY ("id")
);

-- AlterTable (aditiva: columnas nullable)
ALTER TABLE "Voucher" ADD COLUMN "liquidacionSemanalId" TEXT;
ALTER TABLE "Voucher" ADD COLUMN "resultadoLiquidacion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "VoucherLiquidacion_tenantId_hasta_key" ON "VoucherLiquidacion"("tenantId", "hasta");
CREATE UNIQUE INDEX "VoucherPagoAdministracion_tenantId_clave_key" ON "VoucherPagoAdministracion"("tenantId", "clave");
CREATE UNIQUE INDEX "VoucherPagoAdministracion_liquidacionId_key" ON "VoucherPagoAdministracion"("liquidacionId");
CREATE INDEX "VoucherPagoAdministracion_tenantId_fecha_idx" ON "VoucherPagoAdministracion"("tenantId", "fecha");
CREATE INDEX "Voucher_tenantId_liquidacionSemanalId_idx" ON "Voucher"("tenantId", "liquidacionSemanalId");

-- AddForeignKey
ALTER TABLE "VoucherLiquidacion" ADD CONSTRAINT "VoucherLiquidacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherPagoAdministracion" ADD CONSTRAINT "VoucherPagoAdministracion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VoucherPagoAdministracion" ADD CONSTRAINT "VoucherPagoAdministracion_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "VoucherLiquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_liquidacionSemanalId_fkey" FOREIGN KEY ("liquidacionSemanalId") REFERENCES "VoucherLiquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valores cerrados (TEXT + CHECK: un enum en Neon es irreversible).
ALTER TABLE "VoucherLiquidacion" ADD CONSTRAINT "VoucherLiquidacion_estado_check" CHECK ("estado" IN ('ABIERTA', 'CONCILIADA'));
ALTER TABLE "VoucherLiquidacion" ADD CONSTRAINT "VoucherLiquidacion_dias_check" CHECK ("desde" ~ '^\d{4}-\d{2}-\d{2}$' AND "hasta" ~ '^\d{4}-\d{2}-\d{2}$' AND "desde" <= "hasta");
ALTER TABLE "VoucherLiquidacion" ADD CONSTRAINT "VoucherLiquidacion_montos_check" CHECK ("cantidad" >= 0 AND "total" >= 0 AND ("pagado" IS NULL OR "pagado" >= 0));
-- Conciliada ⇔ tiene el pago anotado.
ALTER TABLE "VoucherLiquidacion" ADD CONSTRAINT "VoucherLiquidacion_conciliada_check" CHECK (("estado" = 'CONCILIADA') = ("pagado" IS NOT NULL AND "diferencia" IS NOT NULL AND "conciliadoEn" IS NOT NULL));
ALTER TABLE "VoucherLiquidacion" ADD CONSTRAINT "VoucherLiquidacion_pagoMedio_check" CHECK ("pagoMedio" IS NULL OR "pagoMedio" IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'OTRO'));
ALTER TABLE "VoucherPagoAdministracion" ADD CONSTRAINT "VoucherPagoAdministracion_monto_check" CHECK ("monto" > 0);
ALTER TABLE "VoucherPagoAdministracion" ADD CONSTRAINT "VoucherPagoAdministracion_fecha_check" CHECK ("fecha" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "VoucherPagoAdministracion" ADD CONSTRAINT "VoucherPagoAdministracion_medio_check" CHECK ("medio" IN ('TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'OTRO'));
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_resultadoLiquidacion_check" CHECK ("resultadoLiquidacion" IS NULL OR ("resultadoLiquidacion" IN ('PAGADO', 'IMPAGO') AND "liquidacionSemanalId" IS NOT NULL));
-- Sólo un voucher USADO entra en una liquidación semanal.
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_liquidacionSemanal_solo_usado_check" CHECK ("liquidacionSemanalId" IS NULL OR "estado" = 'USADO');

-- RLS: aislamiento por negocio (mismo molde que 20261105122000_vouchers).
ALTER TABLE "VoucherLiquidacion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VoucherLiquidacion";
CREATE POLICY tenant_isolation ON "VoucherLiquidacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "VoucherPagoAdministracion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VoucherPagoAdministracion";
CREATE POLICY tenant_isolation ON "VoucherPagoAdministracion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'd1a3a67b65cb74551cd79e0aa009f2dd0ee16c779183100851a8fee02186df2d', now(), '20261108140000_voucher_liquidacion_semanal', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 1 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261108140000_voucher_liquidacion_semanal') ORDER BY migration_name;
