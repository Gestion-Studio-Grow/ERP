-- CRM comercial · tabla de APOYO de la prueba local (GSG-CRM-011 parte 3; GSG-CRM-018 la sacó de las migraciones).
-- Anota qué filas cargó la prueba con los 20 leads ficticios y los clientes activos (y cómo entró cada lead), para
-- que la limpieza borre SÓLO eso y sólo de un negocio.
-- NO ES UNA MIGRACIÓN y nunca va a producción: la aplica `npm run crm:prueba-local` sobre la base en memoria y
-- los tests de la carga sobre su base efímera, después de `prisma/migrations`. No está en `schema.prisma`: la
-- carga la lee y escribe con SQL (`src/lib/crm-comercial/carga-prueba.ts`). Sin ella, la carga contesta «falta
-- la tabla de apoyo» y no escribe nada (por eso tampoco carga contra una base publicada).
-- Idempotente: se puede aplicar dos veces.

-- CreateTable
CREATE TABLE IF NOT EXISTS "FilaDePruebaCrm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "filaId" TEXT,
    "nota" TEXT,
    "lote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilaDePruebaCrm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FilaDePruebaCrm_tenantId_entidad_idx" ON "FilaDePruebaCrm"("tenantId", "entidad");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FilaDePruebaCrm_tenantId_entidad_clave_key" ON "FilaDePruebaCrm"("tenantId", "entidad", "clave");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "FilaDePruebaCrm" ADD CONSTRAINT "FilaDePruebaCrm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CHECKs ─────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "FilaDePruebaCrm" ADD CONSTRAINT "FilaDePruebaCrm_entidad_check" CHECK ("entidad" IN ('LEAD', 'CLIENTE', 'MARCA', 'EVENTO', 'EVENTO_MARCA', 'OPORTUNIDAD', 'CONTACTO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "FilaDePruebaCrm" ADD CONSTRAINT "FilaDePruebaCrm_textos_check" CHECK (length(btrim("clave")) > 0 AND length(btrim("lote")) > 0 AND ("nota" IS NULL OR length("nota") <= 2000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS: aislamiento por negocio (mismo molde que 20261116150000_crm_comercial) ─────────────────────────

ALTER TABLE "FilaDePruebaCrm" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FilaDePruebaCrm";
CREATE POLICY tenant_isolation ON "FilaDePruebaCrm"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
