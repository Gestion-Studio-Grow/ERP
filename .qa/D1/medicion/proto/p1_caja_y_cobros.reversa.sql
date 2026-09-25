-- Reversa de p1_caja_y_cobros: vuelve a Float. Las filas de antes recuperan su valor EXACTO del respaldo;
-- las escritas después salen de la numeric (exactas al centavo). Anda con el código viejo y con el nuevo (medido).
DO $reversa$ BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  ALTER TABLE "CashMovement" ALTER COLUMN "amount" TYPE double precision USING coalesce("amount_float", "amount"::float8);
  ALTER TABLE "CashMovement" DROP COLUMN "amount_float";
  ALTER TABLE "CashSession" ALTER COLUMN "openingFloat" TYPE double precision USING coalesce("openingFloat_float", "openingFloat"::float8), ALTER COLUMN "closingExpected" TYPE double precision USING coalesce("closingExpected_float", "closingExpected"::float8), ALTER COLUMN "closingCounted" TYPE double precision USING coalesce("closingCounted_float", "closingCounted"::float8), ALTER COLUMN "closingDiff" TYPE double precision USING coalesce("closingDiff_float", "closingDiff"::float8);
  ALTER TABLE "CashSession" DROP COLUMN "openingFloat_float", DROP COLUMN "closingExpected_float", DROP COLUMN "closingCounted_float", DROP COLUMN "closingDiff_float";
  ALTER TABLE "Payment" ALTER COLUMN "amount" TYPE double precision USING coalesce("amount_float", "amount"::float8);
  ALTER TABLE "Payment" DROP COLUMN "amount_float";
  ALTER TABLE "CommissionPayout" ALTER COLUMN "amount" TYPE double precision USING coalesce("amount_float", "amount"::float8);
  ALTER TABLE "CommissionPayout" DROP COLUMN "amount_float";
END $reversa$;
