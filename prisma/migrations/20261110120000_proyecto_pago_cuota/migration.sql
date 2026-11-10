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

