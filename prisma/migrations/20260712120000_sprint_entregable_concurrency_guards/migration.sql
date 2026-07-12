-- Sprint de fixes (entregable) — guardas de CONCURRENCIA/IDEMPOTENCIA a nivel DB. Cierra tres
-- carreras que un cliente real pisa el primer día (plata/stock/concurrencia):
--
--   A-1 · Order.idempotencyKey + @@unique([tenantId, idempotencyKey])
--         Doble-submit del pedido de vidriera → un solo pedido (el 2º choca el unique y se
--         devuelve el ganador). El código lo ESCRIBE solo cuando hay clave (vidriera); el POS/API
--         omiten el campo, así que la columna nueva no rompe esos caminos antes de migrar.
--
--   A-5 · @@unique(CashMovement[tenantId, orderId, type])
--         Doble-click en "Marcar cobrado" → un solo asiento VENTA por pedido (antes duplicaba y
--         el arqueo quedaba con plata de más). Los movimientos sin pedido (APERTURA/INGRESO/…,
--         orderId NULL) NO colisionan (NULLs distintos en Postgres).
--
--   A-6 · Invoice.mpPaymentId + @@unique([tenantId, mpPaymentId])
--         Webhook de Mercado Pago duplicado → una sola factura por pago (dedupe por payment_id).
--
-- TODO ADITIVO: 2 columnas nullable + 3 índices únicos (NULLs no colisionan). No toca ninguna
-- fila viva. Generada con `prisma migrate diff` schema→schema (offline) y verificada local
-- (validate + generate + tsc + 957 tests + build). NO aplicada a Neon (Gate 2 — la aplica el
-- dueño con `prisma migrate deploy`). El código de `main` TOLERA que estos índices/columnas no
-- existan todavía (schema-ahead): A-1 cae a P2022→sin clave, A-5/A-6 sin índice = pre-check
-- best-effort, como hoy. Así el deploy de `main` no rompe entre el push y el migrate.
--
-- ⚠️ RLS: Order, CashMovement e Invoice ya tienen `tenantId` y están cubiertas por la policy
--    data-driven (no hace falta re-ejecutar `prisma/rls/0001_enable_rls.sql`: no hay tablas nuevas).

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "mpPaymentId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_mpPaymentId_key" ON "Invoice"("tenantId", "mpPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_idempotencyKey_key" ON "Order"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_tenantId_orderId_type_key" ON "CashMovement"("tenantId", "orderId", "type");
