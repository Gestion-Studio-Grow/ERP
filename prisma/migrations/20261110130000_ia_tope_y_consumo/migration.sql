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


-- Permisos del rol de la app (`app_rls`), más chicos que los del ALTER DEFAULT PRIVILEGES de
-- prisma/rls/0002_app_role.sql (que le da SELECT/INSERT/UPDATE/DELETE a toda tabla nueva):
--   · "IaTope": sólo SELECT. El negocio lee su tope; no puede subírselo ni borrarlo, ni con un error
--     del código. Lo escribe la consola (`guardarTopeIA`, conexión OPERATOR_DATABASE_URL).
--   · "IaConsumo": SELECT, INSERT, UPDATE (reservar, liquidar, contar). Sin DELETE: el negocio no
--     puede borrar lo que gastó.
-- ⚠ Gate del dueño: si OPERATOR_DATABASE_URL también conecta como `app_rls`, la consola NO puede fijar
-- topes (falla cerrado: «no tiene permiso», la IA paga sigue negada). Antes de usar la IA paga, la consola
-- necesita un rol propio con SELECT, INSERT, UPDATE sobre "IaTope" (y sin BYPASSRLS).
-- 0002 re-otorga todo si se lo vuelve a correr: por eso repite este mismo recorte al final.
-- Guardado por la existencia del rol: en una base sin `app_rls` (local, primera corrida) no hace nada.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "IaTope" FROM app_rls;
    GRANT SELECT ON "IaTope" TO app_rls;
    REVOKE DELETE, TRUNCATE ON "IaConsumo" FROM app_rls;
    GRANT SELECT, INSERT, UPDATE ON "IaConsumo" TO app_rls;
  END IF;
END $$;
