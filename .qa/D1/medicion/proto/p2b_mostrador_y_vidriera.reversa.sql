-- Reversa de p2b_mostrador_y_vidriera: vuelve a Float. Las filas de antes recuperan su valor EXACTO del respaldo;
-- las escritas después salen de la numeric (exactas al centavo). Anda con el código viejo y con el nuevo (medido).
DO $reversa$ BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  ALTER TABLE "Order" ALTER COLUMN "subtotal" TYPE double precision USING coalesce("subtotal_float", "subtotal"::float8), ALTER COLUMN "discount" TYPE double precision USING coalesce("discount_float", "discount"::float8), ALTER COLUMN "total" TYPE double precision USING coalesce("total_float", "total"::float8);
  ALTER TABLE "Order" DROP COLUMN "subtotal_float", DROP COLUMN "discount_float", DROP COLUMN "total_float";
  ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" TYPE double precision USING coalesce("unitPrice_float", "unitPrice"::float8), ALTER COLUMN "lineTotal" TYPE double precision USING coalesce("lineTotal_float", "lineTotal"::float8);
  ALTER TABLE "OrderItem" DROP COLUMN "unitPrice_float", DROP COLUMN "lineTotal_float";
  ALTER TABLE "Coupon" ALTER COLUMN "value" TYPE double precision USING coalesce("value_float", "value"::float8);
  ALTER TABLE "Coupon" DROP COLUMN "value_float";
  ALTER TABLE "Product" ALTER COLUMN "price" TYPE double precision USING coalesce("price_float", "price"::float8), ALTER COLUMN "pricePerKg" TYPE double precision USING coalesce("pricePerKg_float", "pricePerKg"::float8);
  ALTER TABLE "Product" DROP COLUMN "price_float", DROP COLUMN "pricePerKg_float";
END $reversa$;
