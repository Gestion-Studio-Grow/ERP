-- Reversa de p4_stock: vuelve a Float. Las filas de antes recuperan su valor EXACTO del respaldo;
-- las escritas después salen de la numeric (exactas al centavo). Anda con el código viejo y con el nuevo (medido).
DO $reversa$ BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  ALTER TABLE "StockMovement" ALTER COLUMN "unitCost" TYPE double precision USING coalesce("unitCost_float", "unitCost"::float8);
  ALTER TABLE "StockMovement" DROP COLUMN "unitCost_float";
END $reversa$;
