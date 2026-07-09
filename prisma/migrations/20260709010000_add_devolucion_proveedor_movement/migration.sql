-- D4 (ADR-060) — valor de enum `DEVOLUCION_PROVEEDOR` para el ledger de stock.
--
-- Habilita la pata de STOCK de la devolución a proveedor: un movimiento de SALIDA en el
-- ledger existente (`StockMovement`), que revierte COGS al costo original y deja rastro
-- (`purchaseId`) a la compra que originó la mercadería. La pata FINANCIERA (crédito en
-- AccountPayable) NO necesita schema: reusa `Collection`(PAYABLE). Ver
-- src/lib/stock/supplier-return.ts.
--
-- ADITIVO puro: solo agrega un valor al enum. No toca tablas ni filas. Verificada OFFLINE
-- (validate + generate + migrate diff schema→schema + tsc + tests); NO aplicada a Neon
-- (§C · Gate 2).
--
-- ⚠️ `ALTER TYPE ... ADD VALUE` requiere PostgreSQL 12+ (Neon 15/16 → OK). El valor no se
--    USA en esta misma transacción (solo lo usan filas de StockMovement en runtime) → seguro.
-- ⚠️ RLS: no cambia (StockMovement ya es tenant-scoped y protegido).

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'DEVOLUCION_PROVEEDOR';
