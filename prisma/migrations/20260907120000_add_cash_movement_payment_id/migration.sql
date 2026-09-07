-- PUENTE TURNOS → LIBRO DE CAJA: `CashMovement.paymentId`.
--
-- Qué cierra: el cobro de un turno (`confirmPayment`, /admin/turnos) creaba sólo un
-- `Payment` y NUNCA un `CashMovement`. Para CH Estética eso es la mayor parte de la plata:
-- el libro que reemplaza la planilla obligaba a retipear justamente lo que más se cobra.
-- Ahora `confirmPayment` asienta una VENTA en el ledger (src/lib/caja/cobro-turno.ts) y
-- este rastro es su CLAVE DE IDEMPOTENCIA: confirmar dos veces (doble click, reintento,
-- dos pestañas) no puede producir dos asientos.
--
--   · `paymentId` nullable con FK a Payment (ON DELETE SET NULL, igual que `orderId`):
--     borrar un pago no borra la plata que entró — el asiento queda, pierde el rastro.
--   · `@@unique(tenantId, paymentId, type)`: misma forma que A-5 para `orderId`. Es el
--     árbitro a nivel DB de la carrera del doble submit; el pre-check dentro de la tx cubre
--     el caso secuencial. Los movimientos sin cobro de turno (NULL) no colisionan entre sí.
--
-- ⚠️ NO APLICADA a Neon (gate del dueño: producción se migra con `prisma migrate deploy`,
--    nunca `migrate dev`). Aditiva, sin downtime, no reinterpreta ninguna fila viva.
--
-- ⚠️ QUÉ SE DEGRADA MIENTRAS NO ESTÉ APLICADA (schema-ahead, tolerado por el código):
--    `confirmPayment` intenta cobrar + asentar en UNA tx; si la DB responde P2022 (columna
--    inexistente) reintenta la MISMA tx SIN el asiento de caja. Resultado: el turno se cobra
--    exactamente como hoy (Payment APPROVED + turno CONFIRMED) y NO llega al libro — el
--    comportamiento previo a este cambio, ni mejor ni peor. Nada se rompe, nada se duplica.
--    Las ventas del mostrador (orderId) NO dependen de esta migración: llegan al libro ya.
--
-- ⚠️ RLS: no hay tablas nuevas. `CashMovement` ya tiene `tenantId` y ya está cubierta por la
--    policy data-driven de `prisma/rls/0001_enable_rls.sql`. No hace falta re-ejecutarla.

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN "paymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_tenantId_paymentId_type_key" ON "CashMovement"("tenantId", "paymentId", "type");
CREATE INDEX "CashMovement_paymentId_idx" ON "CashMovement"("paymentId");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
