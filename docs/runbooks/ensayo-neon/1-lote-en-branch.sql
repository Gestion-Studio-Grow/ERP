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
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261109120000_must_change_password')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261109120000_must_change_password · checksum e5adc63542b220b0136059a17304af070c6c31960117ffc589bc469dedfcac02 ───
-- Cambio obligatorio de contraseña en el próximo ingreso (GSG-SEG-008, 09/11/2026). Antes vivía en
-- prisma/pending-gate2/MustChangePassword.sql, sin aplicar: el reset del OWNER y el alta de una persona desde la
-- consola entregaban una contraseña provisoria que quedaba válida para siempre. Regla del dueño: si el cambio
-- obligatorio no está activo en la base, primero se activa.
--
-- ADITIVA: una columna con default en "User"; no toca datos (todas las filas quedan en false). Idempotente
-- (`IF NOT EXISTS`) por si alguien corrió a mano el SQL de pending-gate2. RLS: viaja en la fila de "User", que ya
-- tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2), el código no emite contraseñas provisorias: el reset y el alta se niegan (fallan cerrado).
-- El build de producción frena si la base está atrás del schema (scripts/vercel-build.mjs).
--
-- Vuelta atrás: ALTER TABLE "User" DROP COLUMN IF EXISTS "mustChangePassword";

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'e5adc63542b220b0136059a17304af070c6c31960117ffc589bc469dedfcac02', now(), '20261109120000_must_change_password', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 1 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261109120000_must_change_password') ORDER BY migration_name;
