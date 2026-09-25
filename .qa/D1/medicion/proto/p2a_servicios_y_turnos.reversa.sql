-- Reversa de p2a_servicios_y_turnos: vuelve a Float. Las filas de antes recuperan su valor EXACTO del respaldo;
-- las escritas después salen de la numeric (exactas al centavo). Anda con el código viejo y con el nuevo (medido).
DO $reversa$ BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  ALTER TABLE "Service" ALTER COLUMN "price" TYPE double precision USING coalesce("price_float", "price"::float8), ALTER COLUMN "residentPrice" TYPE double precision USING coalesce("residentPrice_float", "residentPrice"::float8), ALTER COLUMN "depositAmount" TYPE double precision USING coalesce("depositAmount_float", "depositAmount"::float8);
  ALTER TABLE "Service" DROP COLUMN "price_float", DROP COLUMN "residentPrice_float", DROP COLUMN "depositAmount_float";
  ALTER TABLE "Appointment" ALTER COLUMN "priceAtBooking" TYPE double precision USING coalesce("priceAtBooking_float", "priceAtBooking"::float8), ALTER COLUMN "discountAmount" TYPE double precision USING coalesce("discountAmount_float", "discountAmount"::float8);
  ALTER TABLE "Appointment" DROP COLUMN "priceAtBooking_float", DROP COLUMN "discountAmount_float";
END $reversa$;
