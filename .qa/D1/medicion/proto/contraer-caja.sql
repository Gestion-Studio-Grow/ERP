-- Paso 5 (DESTRUCTIVO, con su propio OK): se va la Float de CashMovement.
BEGIN;
DROP TRIGGER d1_plata ON "CashMovement";
ALTER TABLE "CashMovement" DROP COLUMN "amount";
COMMIT;
