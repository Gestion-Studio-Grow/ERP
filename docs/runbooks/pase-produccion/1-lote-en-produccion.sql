-- =============================================================================
-- PASE A PRODUCCIÓN — el lote vigente de prisma/lote-deploy.txt (hoy: 2 migraciones,
-- 20261109120000_must_change_password y 20261110120000_proyecto_pago_cuota). Se pega en
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
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261109120000_must_change_password', '20261110120000_proyecto_pago_cuota')) THEN
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

-- ─── 20261110120000_proyecto_pago_cuota · checksum 89279179d9e5a4c82424f66d4a1abf064da2afb21b8d90a098dc090eaa69a35a ───
-- D13, opción a (orden del dueño vía ORQ-006, 10/11/2026): cada cobro de un proyecto guarda qué cuota pagó y a qué
-- tipo de cambio quedó fijado. Así un cobro en pesos de un proyecto en dólares no cambia de valor cuando después se
-- actualiza el tipo de cambio del negocio.
--
-- ADITIVA: tres columnas NULLABLE en "ProyectoPago", sin default ni backfill (los cobros viejos quedan en NULL), y un
-- índice. SIN clave foránea a "ProyectoCuota" a propósito: agregar una restricción a una tabla existente deja de ser
-- aditivo (scripts/publicar/lib/sql.mjs lo frena); el código sólo escribe una cuota del mismo negocio y, si la cuota
-- se borra después, el id queda como rastro. No toca datos, enums ni otras tablas. Idempotente (`IF NOT EXISTS`).
-- RLS: las columnas viajan en la fila de "ProyectoPago", que ya tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2): el build de producción frena si la base está atrás del schema (scripts/vercel-build.mjs).
--
-- Vuelta atrás:
--   DROP INDEX IF EXISTS "ProyectoPago_tenantId_cuotaId_idx";
--   ALTER TABLE "ProyectoPago" DROP COLUMN IF EXISTS "cuotaId", DROP COLUMN IF EXISTS "montoMoneda", DROP COLUMN IF EXISTS "tipoCambio";

ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "cuotaId" TEXT;
ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "montoMoneda" DOUBLE PRECISION;
ALTER TABLE "ProyectoPago" ADD COLUMN IF NOT EXISTS "tipoCambio" DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS "ProyectoPago_tenantId_cuotaId_idx" ON "ProyectoPago"("tenantId", "cuotaId");


INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '89279179d9e5a4c82424f66d4a1abf064da2afb21b8d90a098dc090eaa69a35a', now(), '20261110120000_proyecto_pago_cuota', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 2 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261109120000_must_change_password', '20261110120000_proyecto_pago_cuota') ORDER BY migration_name;
