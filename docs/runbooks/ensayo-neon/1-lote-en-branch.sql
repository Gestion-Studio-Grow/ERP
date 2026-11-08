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
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261108150000_contabilidad_ola2_roles')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261108150000_contabilidad_ola2_roles · checksum 644120bb0bda14b06746b826db233762eb32de7877ce301f62ee72b793d6f84b ───
-- Contabilidad, ola 2 — T0 de Contabilidad + Control de gestión (GSG-CTRL-001, Factory-GSG
-- 20-PRODUCTO/control-de-gestion-DISENO-FINAL.md §3 T0 y control-de-gestion-EMPRESAS.md §2.2).
--
-- ADITIVA: sólo ADD COLUMN nullable, tablas nuevas con RLS, índices y CHECKs sobre columnas nuevas.
-- No toca datos ni columnas existentes, no hay DROP ni ALTER TYPE. Escrita SIN aplicar (Gate 2).
-- El código tolera su ausencia: con el interruptor «contabilidad» apagado no se lee nada; prendido
-- y sin esta migración, P2021/P2022 → «migración pendiente» (src/lib/contabilidad/repo.ts).
-- Requiere 20261104122000_contabilidad_ola1 aplicada (FK a "CuentaContable").
--
--   · CuentaContable: rubro RT 54, plazo, función, monetaria, ritmo, nombre del dueño y
--     monedaCuenta (nivel Corporativo; NULL = ARS).
--   · AsientoLinea.fechaOrigen: fecha de origen de la partida no monetaria (ajuste por inflación, T8).
--   · CuentaRol: qué cuenta cumple cada rol de las reglas, uno por negocio.
--   · ConfigContable: nivel PYME · CORPORATIVO + capacidades (JSON) + rubro del plan sembrado.
--
-- Columnas de AsientoLinea con trigger de inmutabilidad (ola 1): ADD COLUMN no dispara triggers
-- y con NULL no reescribe la tabla.

-- AlterTable
ALTER TABLE "CuentaContable" ADD COLUMN     "funcion" TEXT,
ADD COLUMN     "monedaCuenta" TEXT,
ADD COLUMN     "monetaria" BOOLEAN,
ADD COLUMN     "nombreDueno" TEXT,
ADD COLUMN     "plazo" TEXT,
ADD COLUMN     "ritmo" TEXT,
ADD COLUMN     "rubro" TEXT;

-- AlterTable
ALTER TABLE "AsientoLinea" ADD COLUMN     "fechaOrigen" DATE;

-- CreateTable
CREATE TABLE "CuentaRol" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaRol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigContable" (
    "tenantId" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'PYME',
    "capacidades" JSONB NOT NULL DEFAULT '{}',
    "rubroNegocio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigContable_pkey" PRIMARY KEY ("tenantId")
);

-- CreateIndex
CREATE INDEX "CuentaRol_tenantId_cuentaId_idx" ON "CuentaRol"("tenantId", "cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaRol_tenantId_rol_key" ON "CuentaRol"("tenantId", "rol");

-- AddForeignKey
ALTER TABLE "CuentaRol" ADD CONSTRAINT "CuentaRol_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaRol" ADD CONSTRAINT "CuentaRol_cuentaId_tenantId_fkey" FOREIGN KEY ("cuentaId", "tenantId") REFERENCES "CuentaContable"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Reglas que la base sostiene aunque el código se equivoque ───────────────────────────────
-- Sobre columnas nuevas (todas NULL): validan al instante sin recorrer datos viejos.

ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_plazo_check"
  CHECK ("plazo" IS NULL OR "plazo" IN ('CORRIENTE', 'NO_CORRIENTE'));
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_funcion_check"
  CHECK ("funcion" IS NULL OR "funcion" IN ('COSTO', 'COMERCIALIZACION', 'ADMINISTRACION', 'FINANCIACION'));
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_ritmo_check"
  CHECK ("ritmo" IS NULL OR "ritmo" IN ('FIJO_MENSUAL', 'VARIABLE'));
-- El catálogo de rubros RT 54 puede crecer sin migración: acá sólo la forma.
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_rubro_check"
  CHECK ("rubro" IS NULL OR "rubro" ~ '^[A-Z][A-Z_]*$');
ALTER TABLE "CuentaContable" ADD CONSTRAINT "CuentaContable_monedaCuenta_check"
  CHECK ("monedaCuenta" IS NULL OR "monedaCuenta" ~ '^[A-Z]{3}$');

ALTER TABLE "CuentaRol" ADD CONSTRAINT "CuentaRol_rol_check" CHECK ("rol" ~ '^[A-Z][A-Z_]*$');

ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_nivel_check" CHECK ("nivel" IN ('PYME', 'CORPORATIVO'));
ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_capacidades_check" CHECK (jsonb_typeof("capacidades") = 'object');
ALTER TABLE "ConfigContable" ADD CONSTRAINT "ConfigContable_rubroNegocio_check"
  CHECK ("rubroNegocio" IS NULL OR "rubroNegocio" IN ('comercio', 'servicios', 'club', 'agencia'));

-- ── RLS: misma policy que el resto (prisma/rls/0001_enable_rls.sql la recrea igual) ───────────

ALTER TABLE "CuentaRol" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CuentaRol";
CREATE POLICY tenant_isolation ON "CuentaRol"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ConfigContable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ConfigContable";
CREATE POLICY tenant_isolation ON "ConfigContable"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '644120bb0bda14b06746b826db233762eb32de7877ce301f62ee72b793d6f84b', now(), '20261108150000_contabilidad_ola2_roles', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 1 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261108150000_contabilidad_ola2_roles') ORDER BY migration_name;
