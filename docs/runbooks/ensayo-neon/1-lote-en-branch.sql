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
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261110170000_tenant_cuit_verificado')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261110170000_tenant_cuit_verificado · checksum 02e68731647b9fa42281ce63ead34d293a3c7b85250d4c9a37b073c23c6e3b6a ───
-- CUIT verificado del alta web de Factoque (D4 del dueño, 09/11/2026 23:50): el CUIT queda «sin verificar» hasta
-- que el titular conecta ARCA, y el alta sin verificar vence a los 15 días. Verificado = ARCA de PRODUCCIÓN aceptó el
-- certificado del negocio (sólo lo saca el titular con su clave fiscal). Esta columna guarda cuándo, para que el
-- estado no dependa sólo de la auditoría (src/lib/fiscal/tenant-cert.ts → registrarPruebaArcaOk).
--
-- ADITIVA: una columna nullable en "Tenant", sin default y sin backfill (no toca datos). Idempotente
-- (`IF NOT EXISTS`). RLS: viaja en la fila de "Tenant", que ya tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2), el código sigue verificando por la auditoría (fiscal.arca.prueba-ok de producción):
-- la lee con SQL crudo después de preguntar a information_schema si existe (tenedores-del-cuit.server.ts).
--
-- Vuelta atrás: ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "cuitVerificadoEn";

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "cuitVerificadoEn" TIMESTAMP(3);

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '02e68731647b9fa42281ce63ead34d293a3c7b85250d4c9a37b073c23c6e3b6a', now(), '20261110170000_tenant_cuit_verificado', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 1 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261110170000_tenant_cuit_verificado') ORDER BY migration_name;
