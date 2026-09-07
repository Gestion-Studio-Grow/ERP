-- COBROS PARCIALES DE TURNO (seña al reservar + saldo al completar) — src/lib/turnos.
--
-- Qué cierra (medido por QA): el flujo real de CH Estética es "reservado → confirmado →
-- realizado → completado, y la seña se cobra al reservar". Hoy un turno cargado como
-- Confirmado y marcado Completado quedaba con ingreso $0, comisión $0 y ficha en $0, y no
-- había forma de registrar una seña. `Collection.appointmentId` (D9) ya modelaba cobros
-- parciales por turno pero no tenía llamadores; este cambio los cablea. Dos columnas:
--
--   · `Collection.idempotencyKey` + `@@unique(tenantId, idempotencyKey)`: misma forma que
--     `Order.idempotencyKey` (A-1). Cobrar dos veces por doble clic no puede duplicar plata:
--     el pre-check dentro de la tx cubre el caso secuencial y este @@unique es el árbitro
--     de la carrera. Los cobros sin clave (NULL) no colisionan.
--   · `CashMovement.collectionId` + `@@unique(tenantId, collectionId, type)`: el puente al
--     libro de caja pasa a estar keyeado por el COBRO concreto, no por `Payment` (que es
--     1:1 con el turno y desde ahora es el agregado de sus cobros: con `paymentId` como
--     clave, el segundo cobro del mismo turno chocaría el @@unique existente).
--
-- ⚠️ NO APLICADA a Neon (gate del dueño: producción se migra con `prisma migrate deploy`,
--    nunca `migrate dev`). Aditiva, sin downtime, no reinterpreta ninguna fila viva.
--
-- ⚠️ QUÉ SE DEGRADA MIENTRAS NO ESTÉ APLICADA (schema-ahead, tolerado por el código):
--    el cobro (seña/saldo) se registra igual —Collection + Payment agregado— pero SIN clave
--    de idempotencia persistente (queda la guarda del botón deshabilitado + la guarda de
--    saldo, que rechaza cobrar por encima de lo que falta) y SIN asiento en el libro de
--    caja (la dueña lo tipea a mano, como antes del puente). Nada se rompe ni se duplica.
--
-- ⚠️ RLS: no hay tablas nuevas. `Collection` y `CashMovement` ya tienen `tenantId` y están
--    cubiertas por la policy data-driven de `prisma/rls/0001_enable_rls.sql`.

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Collection_tenantId_idempotencyKey_key" ON "Collection"("tenantId", "idempotencyKey");

-- AlterTable
ALTER TABLE "CashMovement" ADD COLUMN "collectionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_tenantId_collectionId_type_key" ON "CashMovement"("tenantId", "collectionId", "type");
CREATE INDEX "CashMovement_collectionId_idx" ON "CashMovement"("collectionId");

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
