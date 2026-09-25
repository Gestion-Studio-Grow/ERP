-- Prototipo de la expansión D1 (sólo local): columnas nuevas + trigger de doble escritura.
BEGIN;
ALTER TABLE "CashMovement" ADD COLUMN IF NOT EXISTS "amountDec" numeric(14,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "subtotalDec" numeric(14,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountDec" numeric(14,2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "totalDec" numeric(14,2);

-- Un par (Float viejo, numeric nuevo) se sincroniza así:
--   INSERT: si vino el numeric (código nuevo), manda y se copia al Float; si no, se deriva del Float.
--   UPDATE: el que cambió manda; si cambiaron los dos, manda el numeric.
CREATE OR REPLACE FUNCTION d1_par(viejo float8, nuevo numeric, viejo_ant float8, nuevo_ant numeric, es_insert boolean,
                                  OUT v float8, OUT n numeric) LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  v := viejo; n := nuevo;
  IF es_insert THEN
    IF nuevo IS NOT NULL THEN v := nuevo::float8; ELSE n := round(viejo::numeric, 2); END IF;
  ELSIF nuevo IS DISTINCT FROM nuevo_ant THEN
    -- Cambió la nueva. Si al centavo ya es lo que dice la vieja (la copia, o el código nuevo
    -- reescribiendo el mismo importe), la Float NO se toca: su valor original sigue ahí hasta
    -- el paso destructivo y la reversa es exacta.
    IF nuevo IS DISTINCT FROM round(viejo::numeric, 2) THEN v := nuevo::float8; END IF;
  ELSIF viejo IS DISTINCT FROM viejo_ant THEN n := round(viejo::numeric, 2);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION d1_sync_cashmovement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ins boolean := TG_OP = 'INSERT';
BEGIN
  SELECT * INTO NEW."amount", NEW."amountDec" FROM d1_par(NEW."amount", NEW."amountDec",
    CASE WHEN ins THEN NULL ELSE OLD."amount" END, CASE WHEN ins THEN NULL ELSE OLD."amountDec" END, ins);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS d1_sync ON "CashMovement";
CREATE TRIGGER d1_sync BEFORE INSERT OR UPDATE ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION d1_sync_cashmovement();

CREATE OR REPLACE FUNCTION d1_sync_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ins boolean := TG_OP = 'INSERT';
BEGIN
  SELECT * INTO NEW."subtotal", NEW."subtotalDec" FROM d1_par(NEW."subtotal", NEW."subtotalDec",
    CASE WHEN ins THEN NULL ELSE OLD."subtotal" END, CASE WHEN ins THEN NULL ELSE OLD."subtotalDec" END, ins);
  SELECT * INTO NEW."discount", NEW."discountDec" FROM d1_par(NEW."discount", NEW."discountDec",
    CASE WHEN ins THEN NULL ELSE OLD."discount" END, CASE WHEN ins THEN NULL ELSE OLD."discountDec" END, ins);
  SELECT * INTO NEW."total", NEW."totalDec" FROM d1_par(NEW."total", NEW."totalDec",
    CASE WHEN ins THEN NULL ELSE OLD."total" END, CASE WHEN ins THEN NULL ELSE OLD."totalDec" END, ins);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS d1_sync ON "Order";
CREATE TRIGGER d1_sync BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION d1_sync_order();
COMMIT;
