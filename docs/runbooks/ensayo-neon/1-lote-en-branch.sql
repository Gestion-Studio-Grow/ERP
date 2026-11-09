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
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261108130000_user_pin')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261108130000_user_pin · checksum 64b740d4ec5909f8f1729e96fac653178ea7c7e236b218ff4309d95c9f638cef ───
-- PIN de desbloqueo de la sesión del panel (orden del dueño, 08/11/2026; src/lib/sesion-pin.ts). ADITIVA: sólo agrega
-- una tabla; no toca "User" ni datos. Sin aplicar (Gate 2): el código tolera su ausencia (P2021 → «sin PIN», se pide
-- la contraseña). Vuelta atrás: DROP TABLE "UserPin" (no hay otra cosa que dependa de ella).

CREATE TABLE "UserPin" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "fallos" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPin_userId_key" ON "UserPin"("userId");
CREATE INDEX "UserPin_tenantId_idx" ON "UserPin"("tenantId");

ALTER TABLE "UserPin" ADD CONSTRAINT "UserPin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPin" ADD CONSTRAINT "UserPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPin" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UserPin";
CREATE POLICY tenant_isolation ON "UserPin"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '64b740d4ec5909f8f1729e96fac653178ea7c7e236b218ff4309d95c9f638cef', now(), '20261108130000_user_pin', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 1 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261108130000_user_pin') ORDER BY migration_name;
