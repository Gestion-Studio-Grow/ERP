-- =============================================================================
-- ENSAYO DE LA MIGRACIÓN — sólo en un BRANCH de Neon, NUNCA en producción.
-- =============================================================================
-- GENERADO por scripts/ensayo-lote-neon.mjs desde prisma/lote-deploy.txt. No editar a mano.
--
-- Cómo: Neon → Branches → Create branch (desde producción, nombre "ensayo-lote") →
-- SQL Editor → elegí el branch "ensayo-lote" arriba → pegá TODO → Run.
-- Aplica las 5 migraciones en UNA transacción y las registra en _prisma_migrations con el
-- checksum de Prisma. Si algo falla no queda nada a medias, y el error dice qué migración.
-- Después: pegá 2-rls-despues-del-lote.sql (el aislamiento entre negocios, data-driven).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20260815120000_lead_campania', '20260906120000_add_cash_method_libro_caja', '20260907120000_add_cash_movement_payment_id', '20260907180000_add_appointment_partial_collections', '20260911120000_profesional_cobra_en_mostrador')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se ensaya encima.';
  END IF;
END $$;

-- ─── 20260815120000_lead_campania · checksum aaa991f3ee1a50ab7c833e5539a79662eb4fd05eaa249d913e542a901a596ee7 ───
-- Contacto captado por una campaña presencial (QR del evento).
-- Vive aparte de "Client": es un contacto de marketing, no una clienta del negocio.
CREATE TABLE "LeadCampania" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campania" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "instagram" TEXT,
    "aceptaDifusion" BOOLEAN NOT NULL DEFAULT false,
    "consentimientoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCampania_pkey" PRIMARY KEY ("id")
);

-- Una inscripción por teléfono y campaña: hace el alta idempotente.
CREATE UNIQUE INDEX "LeadCampania_tenantId_campania_telefono_key"
    ON "LeadCampania"("tenantId", "campania", "telefono");

CREATE INDEX "LeadCampania_tenantId_campania_idx"
    ON "LeadCampania"("tenantId", "campania");

ALTER TABLE "LeadCampania"
    ADD CONSTRAINT "LeadCampania_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── AISLAMIENTO: esta migración protege la tabla en el mismo acto ───────────
--
-- Hasta acá, NINGUNA de las 21 migraciones que crean una tabla con `tenantId` prendía RLS.
-- No fue un leak porque `prisma/rls/0001_enable_rls.sql` es data-driven —le pone policy a
-- toda tabla con `tenantId`— y se re-corría después. Pero eso deja la protección dependiendo
-- de que alguien se acuerde: entre `migrate deploy` y el re-run de 0001, la tabla nueva
-- existe sin policy. Para ésta, que todavía no se aplicó a Neon, se emite acá.
--
-- Y no es una tabla cualquiera: `LeadCampania` guarda teléfono y consentimiento de difusión
-- de gente que dejó sus datos en un evento, y hay un export CSV. Es el peor dato del sistema
-- para que se cruce entre negocios.
--
-- MISMA policy `tenant_isolation` que 0001, con el mismo criterio: filtra por el GUC
-- `app.current_tenant_id` que setea `tenantTransaction` por request (`src/lib/rls.ts`).
-- Idempotente (DROP IF EXISTS + CREATE). Fail-closed: sin contexto de tenant no se ve ni se
-- escribe nada. No aplica al owner salvo FORCE RLS — el enforcement real lo da conectar como
-- `app_rls`, igual que en 0001.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE "LeadCampania" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON "LeadCampania"';
  EXECUTE 'CREATE POLICY tenant_isolation ON "LeadCampania" '
       || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
       || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))';
END $$;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'aaa991f3ee1a50ab7c833e5539a79662eb4fd05eaa249d913e542a901a596ee7', now(), '20260815120000_lead_campania', NULL, NULL, now(), 1);

-- ─── 20260906120000_add_cash_method_libro_caja · checksum c8d8cd3b7bae2c1804a13ce6858beba3f2d4e77adab61843c93fe92b23180427 ───
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
--    aplicada.
--
-- ⚠️⚠️ ESTA AFIRMACIÓN DEJÓ DE SER CIERTA. Decía: "el resto del sistema (incluido
--    /admin/caja) sigue funcionando sin ella". Era verdad cuando se escribió, y dejó de
--    serlo con el puente de cobros (commit b172307): `recordCashSaleMovementInTx` ahora
--    escribe `method` en TODA venta cobrada, dentro de la misma transacción de la venta,
--    y NINGÚN llamador captura el P2022 (order-core.ts sólo tolera la ausencia de
--    `idempotencyKey`). El cierre de arqueo también selecciona `method`
--    (caja-actions.ts:241).
--
--    Consecuencia: si se deploya ANTES de migrar, cada venta del mostrador falla con 500
--    y se revierte, y el cierre de caja también. No es "el libro no ve los turnos": es el
--    POS caído. EL ORDEN `migrate deploy` → deploy NO ES UNA RECOMENDACIÓN, ES UN
--    REQUISITO.
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

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'c8d8cd3b7bae2c1804a13ce6858beba3f2d4e77adab61843c93fe92b23180427', now(), '20260906120000_add_cash_method_libro_caja', NULL, NULL, now(), 1);

-- ─── 20260907120000_add_cash_movement_payment_id · checksum dbe85bc481778c2b5739817d1da921938b43732d698185c4e7aa12ac0e4d36e5 ───
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

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'dbe85bc481778c2b5739817d1da921938b43732d698185c4e7aa12ac0e4d36e5', now(), '20260907120000_add_cash_movement_payment_id', NULL, NULL, now(), 1);

-- ─── 20260907180000_add_appointment_partial_collections · checksum 1058de899b51b4007181616fb11858888ae7c1b8ccc71ccd9ce545506615caca ───
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

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '1058de899b51b4007181616fb11858888ae7c1b8ccc71ccd9ce545506615caca', now(), '20260907180000_add_appointment_partial_collections', NULL, NULL, now(), 1);

-- ─── 20260911120000_profesional_cobra_en_mostrador · checksum 019ba69114549b6e531be2eadc52e75b85cc4c17383167414f709df4de640b1d ───
-- ¿El MOSTRADOR puede cobrar los turnos de esta profesional?
--
-- Decisión del dueño (2026-09-11): la recepción cobra los servicios de TODAS las
-- profesionales salvo la de uñas, que cobra lo suyo y rinde la comisión después.
--
-- Aditiva y sin downtime. DEFAULT true porque la regla del negocio es "el mostrador
-- cobra": toda fila existente queda en el comportamiento que ya tenía, y la excepción
-- se marca a mano desde el catálogo. Ninguna fila viva se reinterpreta.
--
-- Apagar el flag NO le saca la agenda a nadie: la recepción sigue pudiendo darle turno
-- a esa profesional. Lo único que no puede es cobrarlo.
ALTER TABLE "Professional" ADD COLUMN "cobraEnMostrador" BOOLEAN NOT NULL DEFAULT true;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '019ba69114549b6e531be2eadc52e75b85cc4c17383167414f709df4de640b1d', now(), '20260911120000_profesional_cobra_en_mostrador', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 5 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20260815120000_lead_campania', '20260906120000_add_cash_method_libro_caja', '20260907120000_add_cash_movement_payment_id', '20260907180000_add_appointment_partial_collections', '20260911120000_profesional_cobra_en_mostrador') ORDER BY migration_name;
