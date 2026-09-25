-- Reversa de p3_compras: vuelve a Float. Las filas de antes recuperan su valor EXACTO del respaldo;
-- las escritas después salen de la numeric (exactas al centavo). Anda con el código viejo y con el nuevo (medido).
DO $reversa$ BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  ALTER TABLE "StockPurchase" ALTER COLUMN "totalCost" TYPE double precision USING coalesce("totalCost_float", "totalCost"::float8);
  ALTER TABLE "StockPurchase" DROP COLUMN "totalCost_float";
  ALTER TABLE "StockPurchaseItem" ALTER COLUMN "unitCost" TYPE double precision USING coalesce("unitCost_float", "unitCost"::float8), ALTER COLUMN "lineTotal" TYPE double precision USING coalesce("lineTotal_float", "lineTotal"::float8);
  ALTER TABLE "StockPurchaseItem" DROP COLUMN "unitCost_float", DROP COLUMN "lineTotal_float";
END $reversa$;
