-- D13, opción a (orden del dueño vía ORQ-006, 10/11/2026): cada cobro de un proyecto guarda qué cuota pagó y a qué
-- tipo de cambio quedó fijado. Así un cobro en pesos de un proyecto en dólares no cambia de valor cuando después se
-- actualiza el tipo de cambio del negocio.
--
-- ADITIVA: cuatro columnas NULLABLE en "ProyectoPago", sin default ni backfill (los cobros viejos quedan en NULL), y un
-- índice. SIN clave foránea a "ProyectoCuota" a propósito: agregar una restricción a una tabla existente deja de ser
-- aditivo (scripts/publicar/lib/sql.mjs lo frena); el código sólo escribe una cuota del mismo negocio y, si la cuota
-- se borra después, el id queda como rastro. No toca datos, enums ni otras tablas. Sin `IF NOT EXISTS` (forma de
-- Prisma): así sql.mjs ve las columnas como nuevas y vacías.
-- "moneda" (cert. adversarial D13): la moneda del proyecto AL MOMENTO del cobro, en la que está "montoMoneda". La lectura
-- acepta el valor fijado sólo si coincide con la moneda que el proyecto tiene hoy.
-- RLS: las columnas viajan en la fila de "ProyectoPago", que ya tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2): el build de producción frena si la base está atrás del schema (scripts/vercel-build.mjs).
--
-- Vuelta atrás:
--   DROP INDEX IF EXISTS "ProyectoPago_tenantId_cuotaId_idx";
--   ALTER TABLE "ProyectoPago" DROP COLUMN IF EXISTS "cuotaId", DROP COLUMN IF EXISTS "montoMoneda", DROP COLUMN IF EXISTS "tipoCambio", DROP COLUMN IF EXISTS "moneda";

ALTER TABLE "ProyectoPago" ADD COLUMN "cuotaId" TEXT;
ALTER TABLE "ProyectoPago" ADD COLUMN "montoMoneda" DOUBLE PRECISION;
ALTER TABLE "ProyectoPago" ADD COLUMN "tipoCambio" DOUBLE PRECISION;
ALTER TABLE "ProyectoPago" ADD COLUMN "moneda" TEXT;

CREATE INDEX "ProyectoPago_tenantId_cuotaId_idx" ON "ProyectoPago"("tenantId", "cuotaId");
