-- =============================================================================
-- PASE A PRODUCCIÓN — el lote vigente de prisma/lote-deploy.txt (hoy: 1 migración,
-- 20261013210000_inmobiliaria_recibos). Se pega en el SQL Editor de Neon, en la rama de
-- PRODUCCIÓN, DESPUÉS de crear un branch de respaldo con la fecha del día
-- (Branches → Create branch → "respaldo-AAAA-MM-DD"). Gate 2: sólo con OK del dueño.
-- =============================================================================
-- Mismo SQL que el ensayo (docs/runbooks/ensayo-neon/1-lote-en-branch.sql): aplica el lote en
-- UNA transacción, lo registra en _prisma_migrations con el checksum de Prisma y frena si ya
-- estaba. Si algo falla no queda nada a medias y el error dice cuál.
-- El pase del 23/09 (las 4 migraciones de caja) quedó en el historial de git de este archivo
-- y en respaldo-2026-09-23.md.
--
-- Después: pegá 2-rls-despues-del-lote.sql (el aislamiento entre negocios de las tablas nuevas).
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
