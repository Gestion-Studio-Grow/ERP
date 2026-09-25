-- D1 · paso 2 · COPIAR Y VERIFICAR. Aborta (y no deja nada a medias) si una fila no entra en
-- numeric(14,2) o si al terminar algún negocio no da igual en conteo, suma o fila por fila.
BEGIN;
DO $$ DECLARE malos bigint; BEGIN
  SELECT count(*) INTO malos FROM "Service" WHERE "price" = 'NaN'::float8 OR "price" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("price") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Service.price no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Service" WHERE "residentPrice" = 'NaN'::float8 OR "residentPrice" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("residentPrice") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Service.residentPrice no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Service" WHERE "depositAmount" = 'NaN'::float8 OR "depositAmount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("depositAmount") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Service.depositAmount no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Product" WHERE "price" = 'NaN'::float8 OR "price" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("price") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Product.price no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Product" WHERE "pricePerKg" = 'NaN'::float8 OR "pricePerKg" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("pricePerKg") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Product.pricePerKg no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Appointment" WHERE "priceAtBooking" = 'NaN'::float8 OR "priceAtBooking" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("priceAtBooking") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Appointment.priceAtBooking no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Appointment" WHERE "discountAmount" = 'NaN'::float8 OR "discountAmount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("discountAmount") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Appointment.discountAmount no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "CommissionPayout" WHERE "amount" = 'NaN'::float8 OR "amount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("amount") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de CommissionPayout.amount no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Payment" WHERE "amount" = 'NaN'::float8 OR "amount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("amount") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Payment.amount no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Coupon" WHERE "value" = 'NaN'::float8 OR "value" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("value") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Coupon.value no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Order" WHERE "subtotal" = 'NaN'::float8 OR "subtotal" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("subtotal") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Order.subtotal no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Order" WHERE "discount" = 'NaN'::float8 OR "discount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("discount") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Order.discount no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "Order" WHERE "total" = 'NaN'::float8 OR "total" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("total") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de Order.total no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "OrderItem" WHERE "unitPrice" = 'NaN'::float8 OR "unitPrice" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("unitPrice") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de OrderItem.unitPrice no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "OrderItem" WHERE "lineTotal" = 'NaN'::float8 OR "lineTotal" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("lineTotal") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de OrderItem.lineTotal no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "CashSession" WHERE "openingFloat" = 'NaN'::float8 OR "openingFloat" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("openingFloat") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de CashSession.openingFloat no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "CashSession" WHERE "closingExpected" = 'NaN'::float8 OR "closingExpected" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("closingExpected") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de CashSession.closingExpected no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "CashSession" WHERE "closingCounted" = 'NaN'::float8 OR "closingCounted" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("closingCounted") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de CashSession.closingCounted no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "CashSession" WHERE "closingDiff" = 'NaN'::float8 OR "closingDiff" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("closingDiff") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de CashSession.closingDiff no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "CashMovement" WHERE "amount" = 'NaN'::float8 OR "amount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("amount") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de CashMovement.amount no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "StockPurchase" WHERE "totalCost" = 'NaN'::float8 OR "totalCost" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("totalCost") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de StockPurchase.totalCost no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "StockPurchaseItem" WHERE "unitCost" = 'NaN'::float8 OR "unitCost" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("unitCost") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de StockPurchaseItem.unitCost no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "StockPurchaseItem" WHERE "lineTotal" = 'NaN'::float8 OR "lineTotal" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("lineTotal") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de StockPurchaseItem.lineTotal no entran en numeric(14,2)', malos; END IF;
  SELECT count(*) INTO malos FROM "StockMovement" WHERE "unitCost" = 'NaN'::float8 OR "unitCost" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("unitCost") >= 1e12;
  IF malos > 0 THEN RAISE EXCEPTION 'D1: % filas de StockMovement.unitCost no entran en numeric(14,2)', malos; END IF;
END $$;
UPDATE "Service" SET "priceDec" = round("price"::numeric, 2), "residentPriceDec" = round("residentPrice"::numeric, 2), "depositAmountDec" = round("depositAmount"::numeric, 2) WHERE ("priceDec" IS NULL AND "price" IS NOT NULL) OR ("residentPriceDec" IS NULL AND "residentPrice" IS NOT NULL) OR ("depositAmountDec" IS NULL AND "depositAmount" IS NOT NULL);
UPDATE "Product" SET "priceDec" = round("price"::numeric, 2), "pricePerKgDec" = round("pricePerKg"::numeric, 2) WHERE ("priceDec" IS NULL AND "price" IS NOT NULL) OR ("pricePerKgDec" IS NULL AND "pricePerKg" IS NOT NULL);
UPDATE "Appointment" SET "priceAtBookingDec" = round("priceAtBooking"::numeric, 2), "discountAmountDec" = round("discountAmount"::numeric, 2) WHERE ("priceAtBookingDec" IS NULL AND "priceAtBooking" IS NOT NULL) OR ("discountAmountDec" IS NULL AND "discountAmount" IS NOT NULL);
UPDATE "CommissionPayout" SET "amountDec" = round("amount"::numeric, 2) WHERE ("amountDec" IS NULL AND "amount" IS NOT NULL);
UPDATE "Payment" SET "amountDec" = round("amount"::numeric, 2) WHERE ("amountDec" IS NULL AND "amount" IS NOT NULL);
UPDATE "Coupon" SET "valueDec" = round("value"::numeric, 2) WHERE ("valueDec" IS NULL AND "value" IS NOT NULL);
UPDATE "Order" SET "subtotalDec" = round("subtotal"::numeric, 2), "discountDec" = round("discount"::numeric, 2), "totalDec" = round("total"::numeric, 2) WHERE ("subtotalDec" IS NULL AND "subtotal" IS NOT NULL) OR ("discountDec" IS NULL AND "discount" IS NOT NULL) OR ("totalDec" IS NULL AND "total" IS NOT NULL);
UPDATE "OrderItem" SET "unitPriceDec" = round("unitPrice"::numeric, 2), "lineTotalDec" = round("lineTotal"::numeric, 2) WHERE ("unitPriceDec" IS NULL AND "unitPrice" IS NOT NULL) OR ("lineTotalDec" IS NULL AND "lineTotal" IS NOT NULL);
UPDATE "CashSession" SET "openingFloatDec" = round("openingFloat"::numeric, 2), "closingExpectedDec" = round("closingExpected"::numeric, 2), "closingCountedDec" = round("closingCounted"::numeric, 2), "closingDiffDec" = round("closingDiff"::numeric, 2) WHERE ("openingFloatDec" IS NULL AND "openingFloat" IS NOT NULL) OR ("closingExpectedDec" IS NULL AND "closingExpected" IS NOT NULL) OR ("closingCountedDec" IS NULL AND "closingCounted" IS NOT NULL) OR ("closingDiffDec" IS NULL AND "closingDiff" IS NOT NULL);
UPDATE "CashMovement" SET "amountDec" = round("amount"::numeric, 2) WHERE ("amountDec" IS NULL AND "amount" IS NOT NULL);
UPDATE "StockPurchase" SET "totalCostDec" = round("totalCost"::numeric, 2) WHERE ("totalCostDec" IS NULL AND "totalCost" IS NOT NULL);
UPDATE "StockPurchaseItem" SET "unitCostDec" = round("unitCost"::numeric, 2), "lineTotalDec" = round("lineTotal"::numeric, 2) WHERE ("unitCostDec" IS NULL AND "unitCost" IS NOT NULL) OR ("lineTotalDec" IS NULL AND "lineTotal" IS NOT NULL);
UPDATE "StockMovement" SET "unitCostDec" = round("unitCost"::numeric, 2) WHERE ("unitCostDec" IS NULL AND "unitCost" IS NOT NULL);
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT "tenantId" AS t, count("price") AS nv, count("priceDec") AS nn,
                  coalesce(sum(round("price"::numeric, 2)), 0) AS sv, coalesce(sum("priceDec"), 0) AS sn,
                  count(*) FILTER (WHERE "priceDec" IS DISTINCT FROM round("price"::numeric, 2)) AS dist
             FROM "Service" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Service.price no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("residentPrice") AS nv, count("residentPriceDec") AS nn,
                  coalesce(sum(round("residentPrice"::numeric, 2)), 0) AS sv, coalesce(sum("residentPriceDec"), 0) AS sn,
                  count(*) FILTER (WHERE "residentPriceDec" IS DISTINCT FROM round("residentPrice"::numeric, 2)) AS dist
             FROM "Service" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Service.residentPrice no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("depositAmount") AS nv, count("depositAmountDec") AS nn,
                  coalesce(sum(round("depositAmount"::numeric, 2)), 0) AS sv, coalesce(sum("depositAmountDec"), 0) AS sn,
                  count(*) FILTER (WHERE "depositAmountDec" IS DISTINCT FROM round("depositAmount"::numeric, 2)) AS dist
             FROM "Service" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Service.depositAmount no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("price") AS nv, count("priceDec") AS nn,
                  coalesce(sum(round("price"::numeric, 2)), 0) AS sv, coalesce(sum("priceDec"), 0) AS sn,
                  count(*) FILTER (WHERE "priceDec" IS DISTINCT FROM round("price"::numeric, 2)) AS dist
             FROM "Product" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Product.price no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("pricePerKg") AS nv, count("pricePerKgDec") AS nn,
                  coalesce(sum(round("pricePerKg"::numeric, 2)), 0) AS sv, coalesce(sum("pricePerKgDec"), 0) AS sn,
                  count(*) FILTER (WHERE "pricePerKgDec" IS DISTINCT FROM round("pricePerKg"::numeric, 2)) AS dist
             FROM "Product" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Product.pricePerKg no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("priceAtBooking") AS nv, count("priceAtBookingDec") AS nn,
                  coalesce(sum(round("priceAtBooking"::numeric, 2)), 0) AS sv, coalesce(sum("priceAtBookingDec"), 0) AS sn,
                  count(*) FILTER (WHERE "priceAtBookingDec" IS DISTINCT FROM round("priceAtBooking"::numeric, 2)) AS dist
             FROM "Appointment" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Appointment.priceAtBooking no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("discountAmount") AS nv, count("discountAmountDec") AS nn,
                  coalesce(sum(round("discountAmount"::numeric, 2)), 0) AS sv, coalesce(sum("discountAmountDec"), 0) AS sn,
                  count(*) FILTER (WHERE "discountAmountDec" IS DISTINCT FROM round("discountAmount"::numeric, 2)) AS dist
             FROM "Appointment" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Appointment.discountAmount no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("amount") AS nv, count("amountDec") AS nn,
                  coalesce(sum(round("amount"::numeric, 2)), 0) AS sv, coalesce(sum("amountDec"), 0) AS sn,
                  count(*) FILTER (WHERE "amountDec" IS DISTINCT FROM round("amount"::numeric, 2)) AS dist
             FROM "CommissionPayout" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: CommissionPayout.amount no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("amount") AS nv, count("amountDec") AS nn,
                  coalesce(sum(round("amount"::numeric, 2)), 0) AS sv, coalesce(sum("amountDec"), 0) AS sn,
                  count(*) FILTER (WHERE "amountDec" IS DISTINCT FROM round("amount"::numeric, 2)) AS dist
             FROM "Payment" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Payment.amount no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("value") AS nv, count("valueDec") AS nn,
                  coalesce(sum(round("value"::numeric, 2)), 0) AS sv, coalesce(sum("valueDec"), 0) AS sn,
                  count(*) FILTER (WHERE "valueDec" IS DISTINCT FROM round("value"::numeric, 2)) AS dist
             FROM "Coupon" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Coupon.value no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("subtotal") AS nv, count("subtotalDec") AS nn,
                  coalesce(sum(round("subtotal"::numeric, 2)), 0) AS sv, coalesce(sum("subtotalDec"), 0) AS sn,
                  count(*) FILTER (WHERE "subtotalDec" IS DISTINCT FROM round("subtotal"::numeric, 2)) AS dist
             FROM "Order" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Order.subtotal no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("discount") AS nv, count("discountDec") AS nn,
                  coalesce(sum(round("discount"::numeric, 2)), 0) AS sv, coalesce(sum("discountDec"), 0) AS sn,
                  count(*) FILTER (WHERE "discountDec" IS DISTINCT FROM round("discount"::numeric, 2)) AS dist
             FROM "Order" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Order.discount no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("total") AS nv, count("totalDec") AS nn,
                  coalesce(sum(round("total"::numeric, 2)), 0) AS sv, coalesce(sum("totalDec"), 0) AS sn,
                  count(*) FILTER (WHERE "totalDec" IS DISTINCT FROM round("total"::numeric, 2)) AS dist
             FROM "Order" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: Order.total no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("unitPrice") AS nv, count("unitPriceDec") AS nn,
                  coalesce(sum(round("unitPrice"::numeric, 2)), 0) AS sv, coalesce(sum("unitPriceDec"), 0) AS sn,
                  count(*) FILTER (WHERE "unitPriceDec" IS DISTINCT FROM round("unitPrice"::numeric, 2)) AS dist
             FROM "OrderItem" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: OrderItem.unitPrice no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("lineTotal") AS nv, count("lineTotalDec") AS nn,
                  coalesce(sum(round("lineTotal"::numeric, 2)), 0) AS sv, coalesce(sum("lineTotalDec"), 0) AS sn,
                  count(*) FILTER (WHERE "lineTotalDec" IS DISTINCT FROM round("lineTotal"::numeric, 2)) AS dist
             FROM "OrderItem" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: OrderItem.lineTotal no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("openingFloat") AS nv, count("openingFloatDec") AS nn,
                  coalesce(sum(round("openingFloat"::numeric, 2)), 0) AS sv, coalesce(sum("openingFloatDec"), 0) AS sn,
                  count(*) FILTER (WHERE "openingFloatDec" IS DISTINCT FROM round("openingFloat"::numeric, 2)) AS dist
             FROM "CashSession" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: CashSession.openingFloat no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("closingExpected") AS nv, count("closingExpectedDec") AS nn,
                  coalesce(sum(round("closingExpected"::numeric, 2)), 0) AS sv, coalesce(sum("closingExpectedDec"), 0) AS sn,
                  count(*) FILTER (WHERE "closingExpectedDec" IS DISTINCT FROM round("closingExpected"::numeric, 2)) AS dist
             FROM "CashSession" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: CashSession.closingExpected no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("closingCounted") AS nv, count("closingCountedDec") AS nn,
                  coalesce(sum(round("closingCounted"::numeric, 2)), 0) AS sv, coalesce(sum("closingCountedDec"), 0) AS sn,
                  count(*) FILTER (WHERE "closingCountedDec" IS DISTINCT FROM round("closingCounted"::numeric, 2)) AS dist
             FROM "CashSession" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: CashSession.closingCounted no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("closingDiff") AS nv, count("closingDiffDec") AS nn,
                  coalesce(sum(round("closingDiff"::numeric, 2)), 0) AS sv, coalesce(sum("closingDiffDec"), 0) AS sn,
                  count(*) FILTER (WHERE "closingDiffDec" IS DISTINCT FROM round("closingDiff"::numeric, 2)) AS dist
             FROM "CashSession" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: CashSession.closingDiff no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("amount") AS nv, count("amountDec") AS nn,
                  coalesce(sum(round("amount"::numeric, 2)), 0) AS sv, coalesce(sum("amountDec"), 0) AS sn,
                  count(*) FILTER (WHERE "amountDec" IS DISTINCT FROM round("amount"::numeric, 2)) AS dist
             FROM "CashMovement" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: CashMovement.amount no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("totalCost") AS nv, count("totalCostDec") AS nn,
                  coalesce(sum(round("totalCost"::numeric, 2)), 0) AS sv, coalesce(sum("totalCostDec"), 0) AS sn,
                  count(*) FILTER (WHERE "totalCostDec" IS DISTINCT FROM round("totalCost"::numeric, 2)) AS dist
             FROM "StockPurchase" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: StockPurchase.totalCost no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("unitCost") AS nv, count("unitCostDec") AS nn,
                  coalesce(sum(round("unitCost"::numeric, 2)), 0) AS sv, coalesce(sum("unitCostDec"), 0) AS sn,
                  count(*) FILTER (WHERE "unitCostDec" IS DISTINCT FROM round("unitCost"::numeric, 2)) AS dist
             FROM "StockPurchaseItem" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: StockPurchaseItem.unitCost no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("lineTotal") AS nv, count("lineTotalDec") AS nn,
                  coalesce(sum(round("lineTotal"::numeric, 2)), 0) AS sv, coalesce(sum("lineTotalDec"), 0) AS sn,
                  count(*) FILTER (WHERE "lineTotalDec" IS DISTINCT FROM round("lineTotal"::numeric, 2)) AS dist
             FROM "StockPurchaseItem" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: StockPurchaseItem.lineTotal no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
  FOR r IN SELECT "tenantId" AS t, count("unitCost") AS nv, count("unitCostDec") AS nn,
                  coalesce(sum(round("unitCost"::numeric, 2)), 0) AS sv, coalesce(sum("unitCostDec"), 0) AS sn,
                  count(*) FILTER (WHERE "unitCostDec" IS DISTINCT FROM round("unitCost"::numeric, 2)) AS dist
             FROM "StockMovement" GROUP BY "tenantId" LOOP
    IF r.nv <> r.nn OR r.sv <> r.sn OR r.dist <> 0 THEN
      RAISE EXCEPTION 'D1: StockMovement.unitCost no coincide en el negocio % (conteo % / %, suma % / %, filas distintas %)', r.t, r.nv, r.nn, r.sv, r.sn, r.dist;
    END IF;
  END LOOP;
END $$;
COMMIT;
-- Informe por negocio (se guarda en .qa/D1/): lo que la Float tenía debajo del centavo.
SELECT 'Service.price' AS columna, "tenantId", count("priceDec") AS filas, sum("priceDec") AS suma,
       sum("price"::numeric) - sum("priceDec") AS residuo_float,
       count(*) FILTER (WHERE "price"::numeric <> round("price"::numeric, 2)) AS filas_con_residuo
  FROM "Service" GROUP BY "tenantId"
UNION ALL
SELECT 'Service.residentPrice' AS columna, "tenantId", count("residentPriceDec") AS filas, sum("residentPriceDec") AS suma,
       sum("residentPrice"::numeric) - sum("residentPriceDec") AS residuo_float,
       count(*) FILTER (WHERE "residentPrice"::numeric <> round("residentPrice"::numeric, 2)) AS filas_con_residuo
  FROM "Service" GROUP BY "tenantId"
UNION ALL
SELECT 'Service.depositAmount' AS columna, "tenantId", count("depositAmountDec") AS filas, sum("depositAmountDec") AS suma,
       sum("depositAmount"::numeric) - sum("depositAmountDec") AS residuo_float,
       count(*) FILTER (WHERE "depositAmount"::numeric <> round("depositAmount"::numeric, 2)) AS filas_con_residuo
  FROM "Service" GROUP BY "tenantId"
UNION ALL
SELECT 'Product.price' AS columna, "tenantId", count("priceDec") AS filas, sum("priceDec") AS suma,
       sum("price"::numeric) - sum("priceDec") AS residuo_float,
       count(*) FILTER (WHERE "price"::numeric <> round("price"::numeric, 2)) AS filas_con_residuo
  FROM "Product" GROUP BY "tenantId"
UNION ALL
SELECT 'Product.pricePerKg' AS columna, "tenantId", count("pricePerKgDec") AS filas, sum("pricePerKgDec") AS suma,
       sum("pricePerKg"::numeric) - sum("pricePerKgDec") AS residuo_float,
       count(*) FILTER (WHERE "pricePerKg"::numeric <> round("pricePerKg"::numeric, 2)) AS filas_con_residuo
  FROM "Product" GROUP BY "tenantId"
UNION ALL
SELECT 'Appointment.priceAtBooking' AS columna, "tenantId", count("priceAtBookingDec") AS filas, sum("priceAtBookingDec") AS suma,
       sum("priceAtBooking"::numeric) - sum("priceAtBookingDec") AS residuo_float,
       count(*) FILTER (WHERE "priceAtBooking"::numeric <> round("priceAtBooking"::numeric, 2)) AS filas_con_residuo
  FROM "Appointment" GROUP BY "tenantId"
UNION ALL
SELECT 'Appointment.discountAmount' AS columna, "tenantId", count("discountAmountDec") AS filas, sum("discountAmountDec") AS suma,
       sum("discountAmount"::numeric) - sum("discountAmountDec") AS residuo_float,
       count(*) FILTER (WHERE "discountAmount"::numeric <> round("discountAmount"::numeric, 2)) AS filas_con_residuo
  FROM "Appointment" GROUP BY "tenantId"
UNION ALL
SELECT 'CommissionPayout.amount' AS columna, "tenantId", count("amountDec") AS filas, sum("amountDec") AS suma,
       sum("amount"::numeric) - sum("amountDec") AS residuo_float,
       count(*) FILTER (WHERE "amount"::numeric <> round("amount"::numeric, 2)) AS filas_con_residuo
  FROM "CommissionPayout" GROUP BY "tenantId"
UNION ALL
SELECT 'Payment.amount' AS columna, "tenantId", count("amountDec") AS filas, sum("amountDec") AS suma,
       sum("amount"::numeric) - sum("amountDec") AS residuo_float,
       count(*) FILTER (WHERE "amount"::numeric <> round("amount"::numeric, 2)) AS filas_con_residuo
  FROM "Payment" GROUP BY "tenantId"
UNION ALL
SELECT 'Coupon.value' AS columna, "tenantId", count("valueDec") AS filas, sum("valueDec") AS suma,
       sum("value"::numeric) - sum("valueDec") AS residuo_float,
       count(*) FILTER (WHERE "value"::numeric <> round("value"::numeric, 2)) AS filas_con_residuo
  FROM "Coupon" GROUP BY "tenantId"
UNION ALL
SELECT 'Order.subtotal' AS columna, "tenantId", count("subtotalDec") AS filas, sum("subtotalDec") AS suma,
       sum("subtotal"::numeric) - sum("subtotalDec") AS residuo_float,
       count(*) FILTER (WHERE "subtotal"::numeric <> round("subtotal"::numeric, 2)) AS filas_con_residuo
  FROM "Order" GROUP BY "tenantId"
UNION ALL
SELECT 'Order.discount' AS columna, "tenantId", count("discountDec") AS filas, sum("discountDec") AS suma,
       sum("discount"::numeric) - sum("discountDec") AS residuo_float,
       count(*) FILTER (WHERE "discount"::numeric <> round("discount"::numeric, 2)) AS filas_con_residuo
  FROM "Order" GROUP BY "tenantId"
UNION ALL
SELECT 'Order.total' AS columna, "tenantId", count("totalDec") AS filas, sum("totalDec") AS suma,
       sum("total"::numeric) - sum("totalDec") AS residuo_float,
       count(*) FILTER (WHERE "total"::numeric <> round("total"::numeric, 2)) AS filas_con_residuo
  FROM "Order" GROUP BY "tenantId"
UNION ALL
SELECT 'OrderItem.unitPrice' AS columna, "tenantId", count("unitPriceDec") AS filas, sum("unitPriceDec") AS suma,
       sum("unitPrice"::numeric) - sum("unitPriceDec") AS residuo_float,
       count(*) FILTER (WHERE "unitPrice"::numeric <> round("unitPrice"::numeric, 2)) AS filas_con_residuo
  FROM "OrderItem" GROUP BY "tenantId"
UNION ALL
SELECT 'OrderItem.lineTotal' AS columna, "tenantId", count("lineTotalDec") AS filas, sum("lineTotalDec") AS suma,
       sum("lineTotal"::numeric) - sum("lineTotalDec") AS residuo_float,
       count(*) FILTER (WHERE "lineTotal"::numeric <> round("lineTotal"::numeric, 2)) AS filas_con_residuo
  FROM "OrderItem" GROUP BY "tenantId"
UNION ALL
SELECT 'CashSession.openingFloat' AS columna, "tenantId", count("openingFloatDec") AS filas, sum("openingFloatDec") AS suma,
       sum("openingFloat"::numeric) - sum("openingFloatDec") AS residuo_float,
       count(*) FILTER (WHERE "openingFloat"::numeric <> round("openingFloat"::numeric, 2)) AS filas_con_residuo
  FROM "CashSession" GROUP BY "tenantId"
UNION ALL
SELECT 'CashSession.closingExpected' AS columna, "tenantId", count("closingExpectedDec") AS filas, sum("closingExpectedDec") AS suma,
       sum("closingExpected"::numeric) - sum("closingExpectedDec") AS residuo_float,
       count(*) FILTER (WHERE "closingExpected"::numeric <> round("closingExpected"::numeric, 2)) AS filas_con_residuo
  FROM "CashSession" GROUP BY "tenantId"
UNION ALL
SELECT 'CashSession.closingCounted' AS columna, "tenantId", count("closingCountedDec") AS filas, sum("closingCountedDec") AS suma,
       sum("closingCounted"::numeric) - sum("closingCountedDec") AS residuo_float,
       count(*) FILTER (WHERE "closingCounted"::numeric <> round("closingCounted"::numeric, 2)) AS filas_con_residuo
  FROM "CashSession" GROUP BY "tenantId"
UNION ALL
SELECT 'CashSession.closingDiff' AS columna, "tenantId", count("closingDiffDec") AS filas, sum("closingDiffDec") AS suma,
       sum("closingDiff"::numeric) - sum("closingDiffDec") AS residuo_float,
       count(*) FILTER (WHERE "closingDiff"::numeric <> round("closingDiff"::numeric, 2)) AS filas_con_residuo
  FROM "CashSession" GROUP BY "tenantId"
UNION ALL
SELECT 'CashMovement.amount' AS columna, "tenantId", count("amountDec") AS filas, sum("amountDec") AS suma,
       sum("amount"::numeric) - sum("amountDec") AS residuo_float,
       count(*) FILTER (WHERE "amount"::numeric <> round("amount"::numeric, 2)) AS filas_con_residuo
  FROM "CashMovement" GROUP BY "tenantId"
UNION ALL
SELECT 'StockPurchase.totalCost' AS columna, "tenantId", count("totalCostDec") AS filas, sum("totalCostDec") AS suma,
       sum("totalCost"::numeric) - sum("totalCostDec") AS residuo_float,
       count(*) FILTER (WHERE "totalCost"::numeric <> round("totalCost"::numeric, 2)) AS filas_con_residuo
  FROM "StockPurchase" GROUP BY "tenantId"
UNION ALL
SELECT 'StockPurchaseItem.unitCost' AS columna, "tenantId", count("unitCostDec") AS filas, sum("unitCostDec") AS suma,
       sum("unitCost"::numeric) - sum("unitCostDec") AS residuo_float,
       count(*) FILTER (WHERE "unitCost"::numeric <> round("unitCost"::numeric, 2)) AS filas_con_residuo
  FROM "StockPurchaseItem" GROUP BY "tenantId"
UNION ALL
SELECT 'StockPurchaseItem.lineTotal' AS columna, "tenantId", count("lineTotalDec") AS filas, sum("lineTotalDec") AS suma,
       sum("lineTotal"::numeric) - sum("lineTotalDec") AS residuo_float,
       count(*) FILTER (WHERE "lineTotal"::numeric <> round("lineTotal"::numeric, 2)) AS filas_con_residuo
  FROM "StockPurchaseItem" GROUP BY "tenantId"
UNION ALL
SELECT 'StockMovement.unitCost' AS columna, "tenantId", count("unitCostDec") AS filas, sum("unitCostDec") AS suma,
       sum("unitCost"::numeric) - sum("unitCostDec") AS residuo_float,
       count(*) FILTER (WHERE "unitCost"::numeric <> round("unitCost"::numeric, 2)) AS filas_con_residuo
  FROM "StockMovement" GROUP BY "tenantId"
ORDER BY 1, 2;
