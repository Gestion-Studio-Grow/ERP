-- LIBRO DE CAJA mensual multi-medio (reemplazo de la planilla de Google Sheets de CH Estética).
--
-- Qué le faltaba al ledger para poder reproducir la planilla:
--
--   1 · `CashMethod` + `CashMovement.method`
--       La planilla lleva EFECTIVO / MP / TARJETA en COLUMNAS; el ledger era efectivo puro.
--       Sin esta dimensión no hay libro de caja: el saldo por medio no se puede derivar.
--       DEFAULT 'EFECTIVO' porque todo lo que ya existe en la tabla es, por construcción,
--       plata del cajón (el arqueo de turno nunca registró otra cosa). Aditivo: no
--       reinterpreta ninguna fila viva.
--
--   2 · `CashMovement.occurredAt`
--       Fecha CONTABLE, separada de `createdAt` (cuándo se tipeó). La planilla se carga en
--       diferido — el retiro del 17 se anota el 21 —; sin esta columna el libro de un mes
--       ya cerrado cambiaría según cuándo se cargó la fila. Se backfillea con `createdAt`,
--       que para las filas históricas es exactamente la fecha del hecho.
--
--   3 · `CashMovement.sessionId` pasa a NULLABLE
--       Un asiento del libro no pertenece a ningún turno de mostrador: la planilla es
--       continua, no por turno. Cuando SÍ hay un turno abierto, el código engancha el
--       asiento a ese turno para que el arqueo lo vea. La FK y su ON DELETE CASCADE quedan
--       intactas (una FK nullable cascadea igual).
--
-- ⚠️ COMPATIBILIDAD DEL ARQUEO: al existir `method`, `expectedCash` pasa a contar SOLO los
--    movimientos EFECTIVO. Como el default es EFECTIVO y toda fila previa es efectivo, el
--    esperado de cualquier turno histórico da IDÉNTICO. Es una corrección hacia adelante:
--    sin el filtro, un ingreso por MP inflaría el efectivo esperado del cajón.
--
-- ⚠️ NO APLICADA a Neon (gate del dueño: producción se migra con `prisma migrate deploy`,
--    nunca `migrate dev`). Es aditiva y sin downtime, pero el código del Libro de Caja NO
--    tolera que falten estas columnas: la pantalla /admin/caja/libro requiere la migración
--    aplicada. El resto del sistema (incluido /admin/caja) sigue funcionando sin ella.
--
-- ⚠️ RLS: no hay tablas nuevas. `CashMovement` ya tiene `tenantId` y ya está cubierta por la
--    policy data-driven de `prisma/rls/0001_enable_rls.sql`. No hace falta re-ejecutarla.

-- CreateEnum
CREATE TYPE "CashMethod" AS ENUM ('EFECTIVO', 'MP', 'TARJETA');

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN     "method" "CashMethod" NOT NULL DEFAULT 'EFECTIVO',
                           ADD COLUMN     "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: para las filas históricas la fecha del hecho ES la de creación.
UPDATE "CashMovement" SET "occurredAt" = "createdAt";

-- AlterTable — el asiento del libro no cuelga de un turno.
ALTER TABLE "CashMovement" ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CashMovement_tenantId_occurredAt_idx" ON "CashMovement"("tenantId", "occurredAt");
