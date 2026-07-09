-- ROLLBACK de D1 (add_supplier_master). Manual (§C) — Prisma no ejecuta down-migrations;
-- se corre a mano solo si hay que revertir. Orden inverso a migration.sql. Seguro mientras
-- no haya datos que dependan (revierte estructura pura). Mismo criterio que prisma/rls/0001_rollback.sql.

-- Quitar la FK + índice + columna de StockPurchase (las compras conservan su `supplier` texto).
ALTER TABLE "StockPurchase" DROP CONSTRAINT IF EXISTS "StockPurchase_supplierId_fkey";
DROP INDEX IF EXISTS "StockPurchase_tenantId_supplierId_idx";
ALTER TABLE "StockPurchase" DROP COLUMN IF EXISTS "supplierId";

-- Quitar la tabla Supplier (arrastra sus índices y su FK a Tenant).
DROP TABLE IF EXISTS "Supplier";
