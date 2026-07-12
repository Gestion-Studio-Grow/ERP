-- ⛔ SIN APLICAR — Gate 2 (requiere OK del dueño para `migrate deploy`/ejecución en Neon).
-- Origen: QA E2E MAGRA 2026-07-12 (rama qa/magra-e2e). Ver docs/calidad/qa-magra-e2e-2026-07-12.md.
--
-- POR QUÉ: la bandeja de pedidos / POS (`getPosData`, src/lib/order-actions.ts:43-47) hace
--   prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
-- Es la pantalla que el mostrador recarga decenas de veces por turno. Hoy Order tiene
-- @@unique([tenantId, code]) y @@index([tenantId, status]) (schema.prisma:1092-1093) pero
-- NINGÚN índice que soporte el orden por createdAt filtrado por tenant. Al crecer la tabla,
-- el orderBy hace un sort sobre todo el rango del tenant sin índice.
--
-- PRECONDICIÓN DEL FIX DE CÓDIGO: este índice sólo se "enciende" si la query filtra por
-- tenantId (hoy NO lo hace — ver bug [ALTO-3] del reporte). Aplicar el índice y agregar
-- `where: { tenantId }` van juntos.
--
-- Es ADITIVO y reversible (CREATE INDEX ... / DROP INDEX ...). CONCURRENTLY para no bloquear
-- escrituras durante la creación (no puede correr dentro de una transacción de Prisma migrate;
-- ejecutar suelto contra Neon con OK del dueño).

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_tenantId_createdAt_idx"
  ON "Order" ("tenantId", "createdAt" DESC);

-- Rollback:
-- DROP INDEX CONCURRENTLY IF EXISTS "Order_tenantId_createdAt_idx";
