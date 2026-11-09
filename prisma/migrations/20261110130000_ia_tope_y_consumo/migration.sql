-- Etapa 2 de MIA · T4: tope mensual de gasto de IA paga por negocio (src/lib/proyectos/ia-tope.server.ts).
-- ADITIVA e IDEMPOTENTE: dos tablas NUEVAS con RLS. No toca "Tenant" ni datos existentes.
-- Sin aplicar, el código niega la IA paga y deja seguir la gratis (fail-closed, `hayTablasIa`).
-- NO va en prisma/lote-deploy.txt: aplicarla es Gate 2 (orden del dueño).
-- Vuelta atrás: borrar las dos tablas (no hay columnas en tablas viejas).

-- CreateTable
CREATE TABLE IF NOT EXISTS "IaTope" (
    "tenantId" TEXT NOT NULL,
    "topeMensualMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "actualizadoPor" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IaTope_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "IaConsumo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "llamadas" INTEGER NOT NULL DEFAULT 0,
    "llamadasGratis" INTEGER NOT NULL DEFAULT 0,
    "reservadoMicroUsd" BIGINT NOT NULL DEFAULT 0,
    "gastadoMicroUsd" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "IaConsumo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IaConsumo_tenantId_mes_key" ON "IaConsumo"("tenantId", "mes");

-- AddForeignKey + CHECK (con guarda: una segunda corrida no falla)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IaTope_tenantId_fkey') THEN
    ALTER TABLE "IaTope" ADD CONSTRAINT "IaTope_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IaConsumo_tenantId_fkey') THEN
    ALTER TABLE "IaConsumo" ADD CONSTRAINT "IaConsumo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IaTope_tope_check') THEN
    ALTER TABLE "IaTope" ADD CONSTRAINT "IaTope_tope_check" CHECK ("topeMensualMicroUsd" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IaConsumo_mes_check') THEN
    ALTER TABLE "IaConsumo" ADD CONSTRAINT "IaConsumo_mes_check" CHECK ("mes" ~ '^\d{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IaConsumo_montos_check') THEN
    ALTER TABLE "IaConsumo" ADD CONSTRAINT "IaConsumo_montos_check" CHECK ("llamadas" >= 0 AND "llamadasGratis" >= 0 AND "reservadoMicroUsd" >= 0 AND "gastadoMicroUsd" >= 0);
  END IF;
END $$;

-- RLS: aislamiento por negocio (mismo molde que 20261108140000_voucher_liquidacion_semanal).
ALTER TABLE "IaTope" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IaTope";
CREATE POLICY tenant_isolation ON "IaTope"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "IaConsumo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "IaConsumo";
CREATE POLICY tenant_isolation ON "IaConsumo"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
