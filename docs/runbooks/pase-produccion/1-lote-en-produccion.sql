-- =============================================================================
-- PASE A PRODUCCIÓN — el lote vigente de prisma/lote-deploy.txt (hoy: 1 migración,
-- 20261114230000_proyecto_pago_clave_envio; la aplica el build con MIGRATE_DATABASE_URL, este
-- archivo es el camino manual equivalente). Se pega en
-- PRODUCCIÓN, DESPUÉS de crear un branch de respaldo con la fecha del día
-- (Branches → Create branch → "respaldo-AAAA-MM-DD"). Gate 2: sólo con OK del dueño.
-- =============================================================================
-- Mismo SQL que el ensayo (docs/runbooks/ensayo-neon/1-lote-en-branch.sql): aplica el lote en
-- UNA transacción, lo registra en _prisma_migrations con el checksum de Prisma y frena si ya
-- estaba. Si algo falla no queda nada a medias y el error dice cuál.
-- El pase del 23/09 (las 4 migraciones de caja) quedó en el historial de git de este archivo
-- y en respaldo-2026-09-23.md; el de la SEG021 (14-15/11) y el del CRM eventos_y_sponsors (#171, 15/11), en el historial de git.
--
-- Después: pegá 2-rls-despues-del-lote.sql (el aislamiento entre negocios de las tablas nuevas).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261114230000_proyecto_pago_clave_envio')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261114230000_proyecto_pago_clave_envio · checksum 0c4d165ce1bfeb6fb716618889944a4ff7ecb60cf3440dafd2664914631645f6 ───
-- Proyectos · «Registrar cobro»: cada envío del formulario lleva una clave propia, generada en el navegador. Si el
-- mismo envío llega dos veces (doble clic, reintento después de un corte), el segundo encuentra el cobro ya grabado
-- y lo devuelve en vez de grabarlo de nuevo (src/lib/proyectos/acciones.ts → registrarCobro).
--
-- ADITIVA: una columna nullable en "ProyectoPago", sin default y sin backfill (no toca datos), y un índice único por
-- negocio. Los cobros existentes quedan con NULL y Postgres no compara NULL en un índice único: no choca nada.
-- Idempotente (`IF NOT EXISTS`). RLS: viaja en la fila de "ProyectoPago", que ya tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2), el código graba el cobro como hoy, sin clave: las lecturas de "ProyectoPago" nombran sus
-- columnas (pago-columnas.ts) y, si la columna falta (P2022), registrarCobro reintenta sin ella.
--
-- Vuelta atrás: DROP INDEX IF EXISTS "ProyectoPago_tenantId_claveEnvio_key";
--               ALTER TABLE "ProyectoPago" DROP COLUMN IF EXISTS "claveEnvio";

ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "claveEnvio" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoPago_tenantId_claveEnvio_key" ON "ProyectoPago"("tenantId", "claveEnvio");

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '0c4d165ce1bfeb6fb716618889944a4ff7ecb60cf3440dafd2664914631645f6', now(), '20261114230000_proyecto_pago_clave_envio', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 1 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261114230000_proyecto_pago_clave_envio') ORDER BY migration_name;
