-- D1 · paso 1 · EXPANDIR (aditiva). Columnas numeric(14,2) al lado de cada Float de plata y un
-- trigger que mantiene los dos lados iguales al centavo mientras convivan código viejo y nuevo.
-- No cambia ningún valor existente: la Float queda como está hasta el paso destructivo.
BEGIN;

CREATE OR REPLACE FUNCTION d1_sincronizar_plata() RETURNS trigger LANGUAGE plpgsql AS $$
-- Argumentos: pares (columna Float, columna numeric). Regla, por par:
--   INSERT: si vino la numeric (código nuevo) manda y se copia a la Float; si no, la numeric
--           sale de la Float redondeada al centavo (medio hacia arriba, como el resto del sistema).
--   UPDATE: si cambió la numeric y al centavo es distinta de la Float, se copia a la Float;
--           si cambió sólo la Float, se recalcula la numeric. Así la copia inicial no reescribe
--           ninguna Float y la reversa de este paso es exacta.
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  cambios jsonb := '{}'::jsonb;
  i int; cf text; cn text; vf float8; vn numeric;
BEGIN
  FOR i IN 0 .. TG_NARGS / 2 - 1 LOOP
    cf := TG_ARGV[2 * i]; cn := TG_ARGV[2 * i + 1];
    vf := (n ->> cf)::float8; vn := (n ->> cn)::numeric;
    IF TG_OP = 'INSERT' THEN
      IF vn IS NOT NULL THEN vf := vn::float8; ELSE vn := round(vf::numeric, 2); END IF;
    ELSIF (n -> cn) IS DISTINCT FROM (o -> cn) THEN
      IF vn IS DISTINCT FROM round(vf::numeric, 2) THEN vf := vn::float8; END IF;
    ELSIF (n -> cf) IS DISTINCT FROM (o -> cf) THEN
      vn := round(vf::numeric, 2);
    END IF;
    cambios := cambios || jsonb_build_object(cf, vf, cn, vn);
  END LOOP;
  NEW := jsonb_populate_record(NEW, cambios);
  RETURN NEW;
END $$;

ALTER TABLE "Service" ADD COLUMN "priceDec" numeric(14,2);
ALTER TABLE "Service" ADD COLUMN "residentPriceDec" numeric(14,2);
ALTER TABLE "Service" ADD COLUMN "depositAmountDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "Service" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('price', 'priceDec', 'residentPrice', 'residentPriceDec', 'depositAmount', 'depositAmountDec');
ALTER TABLE "Product" ADD COLUMN "priceDec" numeric(14,2);
ALTER TABLE "Product" ADD COLUMN "pricePerKgDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('price', 'priceDec', 'pricePerKg', 'pricePerKgDec');
ALTER TABLE "Appointment" ADD COLUMN "priceAtBookingDec" numeric(14,2);
ALTER TABLE "Appointment" ADD COLUMN "discountAmountDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "Appointment" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('priceAtBooking', 'priceAtBookingDec', 'discountAmount', 'discountAmountDec');
ALTER TABLE "CommissionPayout" ADD COLUMN "amountDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "CommissionPayout" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('amount', 'amountDec');
ALTER TABLE "Payment" ADD COLUMN "amountDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('amount', 'amountDec');
ALTER TABLE "Coupon" ADD COLUMN "valueDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "Coupon" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('value', 'valueDec');
ALTER TABLE "Order" ADD COLUMN "subtotalDec" numeric(14,2);
ALTER TABLE "Order" ADD COLUMN "discountDec" numeric(14,2);
ALTER TABLE "Order" ADD COLUMN "totalDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('subtotal', 'subtotalDec', 'discount', 'discountDec', 'total', 'totalDec');
ALTER TABLE "OrderItem" ADD COLUMN "unitPriceDec" numeric(14,2);
ALTER TABLE "OrderItem" ADD COLUMN "lineTotalDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('unitPrice', 'unitPriceDec', 'lineTotal', 'lineTotalDec');
ALTER TABLE "CashSession" ADD COLUMN "openingFloatDec" numeric(14,2);
ALTER TABLE "CashSession" ADD COLUMN "closingExpectedDec" numeric(14,2);
ALTER TABLE "CashSession" ADD COLUMN "closingCountedDec" numeric(14,2);
ALTER TABLE "CashSession" ADD COLUMN "closingDiffDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "CashSession" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('openingFloat', 'openingFloatDec', 'closingExpected', 'closingExpectedDec', 'closingCounted', 'closingCountedDec', 'closingDiff', 'closingDiffDec');
ALTER TABLE "CashMovement" ADD COLUMN "amountDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "CashMovement" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('amount', 'amountDec');
ALTER TABLE "StockPurchase" ADD COLUMN "totalCostDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "StockPurchase" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('totalCost', 'totalCostDec');
ALTER TABLE "StockPurchaseItem" ADD COLUMN "unitCostDec" numeric(14,2);
ALTER TABLE "StockPurchaseItem" ADD COLUMN "lineTotalDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "StockPurchaseItem" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('unitCost', 'unitCostDec', 'lineTotal', 'lineTotalDec');
ALTER TABLE "StockMovement" ADD COLUMN "unitCostDec" numeric(14,2);
CREATE TRIGGER d1_plata BEFORE INSERT OR UPDATE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION d1_sincronizar_plata('unitCost', 'unitCostDec');
COMMIT;
