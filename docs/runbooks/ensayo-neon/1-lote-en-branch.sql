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
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261013210000_inmobiliaria_recibos')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261013210000_inmobiliaria_recibos · checksum 12fe0933addd451edf2257cb16199cd7a832d542ffcbf6fd7824a9fd5aa1fb55 ───
-- Recibos de alquiler: cada cobro lleva un número correlativo por negocio y la inmobiliaria
-- decide cómo se ve el recibo. Aditiva: dos columnas con NULL permitido y un índice único.
-- Los cobros que ya existen reciben su número por orden de fecha, dentro de cada negocio.

ALTER TABLE "InmoPago" ADD COLUMN "reciboNumero" INTEGER;
ALTER TABLE "InmoConfig" ADD COLUMN "recibo" JSONB;

UPDATE "InmoPago" p
SET "reciboNumero" = n.numero
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", "id") AS numero
  FROM "InmoPago"
) n
WHERE p."id" = n."id";

CREATE UNIQUE INDEX "InmoPago_tenantId_reciboNumero_key" ON "InmoPago"("tenantId", "reciboNumero");

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '12fe0933addd451edf2257cb16199cd7a832d542ffcbf6fd7824a9fd5aa1fb55', now(), '20261013210000_inmobiliaria_recibos', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 1 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261013210000_inmobiliaria_recibos') ORDER BY migration_name;
