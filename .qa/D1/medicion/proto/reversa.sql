BEGIN;
DROP TRIGGER IF EXISTS d1_sync ON "CashMovement";
DROP TRIGGER IF EXISTS d1_sync ON "Order";
DROP FUNCTION IF EXISTS d1_sync_cashmovement();
DROP FUNCTION IF EXISTS d1_sync_order();
DROP FUNCTION IF EXISTS d1_par(float8, numeric, float8, numeric, boolean);
ALTER TABLE "CashMovement" DROP COLUMN IF EXISTS "amountDec";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "subtotalDec", DROP COLUMN IF EXISTS "discountDec", DROP COLUMN IF EXISTS "totalDec";
COMMIT;
