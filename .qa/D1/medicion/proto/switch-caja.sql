-- Paso 3 (porción caja): la numeric pasa a ser la columna del código nuevo.
BEGIN;
ALTER TABLE "CashMovement" ADD CONSTRAINT d1_amountdec_nn CHECK ("amountDec" IS NOT NULL) NOT VALID;
ALTER TABLE "CashMovement" VALIDATE CONSTRAINT d1_amountdec_nn;
ALTER TABLE "CashMovement" ALTER COLUMN "amountDec" SET NOT NULL;
ALTER TABLE "CashMovement" DROP CONSTRAINT d1_amountdec_nn;
COMMIT;
