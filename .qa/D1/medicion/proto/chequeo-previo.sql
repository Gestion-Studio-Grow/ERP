-- D1 · chequeo previo, SÓLO LECTURA. Se puede correr en el SQL Editor de Neon (o dentro de D2/ENG-204).
-- Si 'no_entran' da más de 0, la migración de esa porción va a frenar sin tocar nada.
-- 'con_fraccion_de_centavo' no frena: la migración redondea al centavo y el valor exacto queda en el respaldo.
SELECT 'Service.price' AS columna, "tenantId" AS negocio, count("price") AS filas,
       count(*) FILTER (WHERE "price" = 'NaN'::float8 OR "price" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("price") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "price" <> 'NaN'::float8 AND abs("price") < 1e12 AND "price"::numeric <> round("price"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Service" GROUP BY "tenantId"
UNION ALL
SELECT 'Service.residentPrice' AS columna, "tenantId" AS negocio, count("residentPrice") AS filas,
       count(*) FILTER (WHERE "residentPrice" = 'NaN'::float8 OR "residentPrice" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("residentPrice") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "residentPrice" <> 'NaN'::float8 AND abs("residentPrice") < 1e12 AND "residentPrice"::numeric <> round("residentPrice"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Service" GROUP BY "tenantId"
UNION ALL
SELECT 'Service.depositAmount' AS columna, "tenantId" AS negocio, count("depositAmount") AS filas,
       count(*) FILTER (WHERE "depositAmount" = 'NaN'::float8 OR "depositAmount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("depositAmount") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "depositAmount" <> 'NaN'::float8 AND abs("depositAmount") < 1e12 AND "depositAmount"::numeric <> round("depositAmount"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Service" GROUP BY "tenantId"
UNION ALL
SELECT 'Product.price' AS columna, "tenantId" AS negocio, count("price") AS filas,
       count(*) FILTER (WHERE "price" = 'NaN'::float8 OR "price" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("price") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "price" <> 'NaN'::float8 AND abs("price") < 1e12 AND "price"::numeric <> round("price"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Product" GROUP BY "tenantId"
UNION ALL
SELECT 'Product.pricePerKg' AS columna, "tenantId" AS negocio, count("pricePerKg") AS filas,
       count(*) FILTER (WHERE "pricePerKg" = 'NaN'::float8 OR "pricePerKg" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("pricePerKg") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "pricePerKg" <> 'NaN'::float8 AND abs("pricePerKg") < 1e12 AND "pricePerKg"::numeric <> round("pricePerKg"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Product" GROUP BY "tenantId"
UNION ALL
SELECT 'Appointment.priceAtBooking' AS columna, "tenantId" AS negocio, count("priceAtBooking") AS filas,
       count(*) FILTER (WHERE "priceAtBooking" = 'NaN'::float8 OR "priceAtBooking" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("priceAtBooking") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "priceAtBooking" <> 'NaN'::float8 AND abs("priceAtBooking") < 1e12 AND "priceAtBooking"::numeric <> round("priceAtBooking"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Appointment" GROUP BY "tenantId"
UNION ALL
SELECT 'Appointment.discountAmount' AS columna, "tenantId" AS negocio, count("discountAmount") AS filas,
       count(*) FILTER (WHERE "discountAmount" = 'NaN'::float8 OR "discountAmount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("discountAmount") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "discountAmount" <> 'NaN'::float8 AND abs("discountAmount") < 1e12 AND "discountAmount"::numeric <> round("discountAmount"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Appointment" GROUP BY "tenantId"
UNION ALL
SELECT 'CommissionPayout.amount' AS columna, "tenantId" AS negocio, count("amount") AS filas,
       count(*) FILTER (WHERE "amount" = 'NaN'::float8 OR "amount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("amount") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "amount" <> 'NaN'::float8 AND abs("amount") < 1e12 AND "amount"::numeric <> round("amount"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "CommissionPayout" GROUP BY "tenantId"
UNION ALL
SELECT 'Payment.amount' AS columna, "tenantId" AS negocio, count("amount") AS filas,
       count(*) FILTER (WHERE "amount" = 'NaN'::float8 OR "amount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("amount") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "amount" <> 'NaN'::float8 AND abs("amount") < 1e12 AND "amount"::numeric <> round("amount"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Payment" GROUP BY "tenantId"
UNION ALL
SELECT 'Coupon.value' AS columna, "tenantId" AS negocio, count("value") AS filas,
       count(*) FILTER (WHERE "value" = 'NaN'::float8 OR "value" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("value") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "value" <> 'NaN'::float8 AND abs("value") < 1e12 AND "value"::numeric <> round("value"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Coupon" GROUP BY "tenantId"
UNION ALL
SELECT 'Order.subtotal' AS columna, "tenantId" AS negocio, count("subtotal") AS filas,
       count(*) FILTER (WHERE "subtotal" = 'NaN'::float8 OR "subtotal" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("subtotal") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "subtotal" <> 'NaN'::float8 AND abs("subtotal") < 1e12 AND "subtotal"::numeric <> round("subtotal"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Order" GROUP BY "tenantId"
UNION ALL
SELECT 'Order.discount' AS columna, "tenantId" AS negocio, count("discount") AS filas,
       count(*) FILTER (WHERE "discount" = 'NaN'::float8 OR "discount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("discount") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "discount" <> 'NaN'::float8 AND abs("discount") < 1e12 AND "discount"::numeric <> round("discount"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Order" GROUP BY "tenantId"
UNION ALL
SELECT 'Order.total' AS columna, "tenantId" AS negocio, count("total") AS filas,
       count(*) FILTER (WHERE "total" = 'NaN'::float8 OR "total" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("total") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "total" <> 'NaN'::float8 AND abs("total") < 1e12 AND "total"::numeric <> round("total"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "Order" GROUP BY "tenantId"
UNION ALL
SELECT 'OrderItem.unitPrice' AS columna, "tenantId" AS negocio, count("unitPrice") AS filas,
       count(*) FILTER (WHERE "unitPrice" = 'NaN'::float8 OR "unitPrice" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("unitPrice") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "unitPrice" <> 'NaN'::float8 AND abs("unitPrice") < 1e12 AND "unitPrice"::numeric <> round("unitPrice"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "OrderItem" GROUP BY "tenantId"
UNION ALL
SELECT 'OrderItem.lineTotal' AS columna, "tenantId" AS negocio, count("lineTotal") AS filas,
       count(*) FILTER (WHERE "lineTotal" = 'NaN'::float8 OR "lineTotal" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("lineTotal") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "lineTotal" <> 'NaN'::float8 AND abs("lineTotal") < 1e12 AND "lineTotal"::numeric <> round("lineTotal"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "OrderItem" GROUP BY "tenantId"
UNION ALL
SELECT 'CashSession.openingFloat' AS columna, "tenantId" AS negocio, count("openingFloat") AS filas,
       count(*) FILTER (WHERE "openingFloat" = 'NaN'::float8 OR "openingFloat" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("openingFloat") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "openingFloat" <> 'NaN'::float8 AND abs("openingFloat") < 1e12 AND "openingFloat"::numeric <> round("openingFloat"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "CashSession" GROUP BY "tenantId"
UNION ALL
SELECT 'CashSession.closingExpected' AS columna, "tenantId" AS negocio, count("closingExpected") AS filas,
       count(*) FILTER (WHERE "closingExpected" = 'NaN'::float8 OR "closingExpected" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("closingExpected") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "closingExpected" <> 'NaN'::float8 AND abs("closingExpected") < 1e12 AND "closingExpected"::numeric <> round("closingExpected"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "CashSession" GROUP BY "tenantId"
UNION ALL
SELECT 'CashSession.closingCounted' AS columna, "tenantId" AS negocio, count("closingCounted") AS filas,
       count(*) FILTER (WHERE "closingCounted" = 'NaN'::float8 OR "closingCounted" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("closingCounted") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "closingCounted" <> 'NaN'::float8 AND abs("closingCounted") < 1e12 AND "closingCounted"::numeric <> round("closingCounted"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "CashSession" GROUP BY "tenantId"
UNION ALL
SELECT 'CashSession.closingDiff' AS columna, "tenantId" AS negocio, count("closingDiff") AS filas,
       count(*) FILTER (WHERE "closingDiff" = 'NaN'::float8 OR "closingDiff" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("closingDiff") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "closingDiff" <> 'NaN'::float8 AND abs("closingDiff") < 1e12 AND "closingDiff"::numeric <> round("closingDiff"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "CashSession" GROUP BY "tenantId"
UNION ALL
SELECT 'CashMovement.amount' AS columna, "tenantId" AS negocio, count("amount") AS filas,
       count(*) FILTER (WHERE "amount" = 'NaN'::float8 OR "amount" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("amount") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "amount" <> 'NaN'::float8 AND abs("amount") < 1e12 AND "amount"::numeric <> round("amount"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "CashMovement" GROUP BY "tenantId"
UNION ALL
SELECT 'StockPurchase.totalCost' AS columna, "tenantId" AS negocio, count("totalCost") AS filas,
       count(*) FILTER (WHERE "totalCost" = 'NaN'::float8 OR "totalCost" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("totalCost") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "totalCost" <> 'NaN'::float8 AND abs("totalCost") < 1e12 AND "totalCost"::numeric <> round("totalCost"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "StockPurchase" GROUP BY "tenantId"
UNION ALL
SELECT 'StockPurchaseItem.unitCost' AS columna, "tenantId" AS negocio, count("unitCost") AS filas,
       count(*) FILTER (WHERE "unitCost" = 'NaN'::float8 OR "unitCost" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("unitCost") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "unitCost" <> 'NaN'::float8 AND abs("unitCost") < 1e12 AND "unitCost"::numeric <> round("unitCost"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "StockPurchaseItem" GROUP BY "tenantId"
UNION ALL
SELECT 'StockPurchaseItem.lineTotal' AS columna, "tenantId" AS negocio, count("lineTotal") AS filas,
       count(*) FILTER (WHERE "lineTotal" = 'NaN'::float8 OR "lineTotal" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("lineTotal") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "lineTotal" <> 'NaN'::float8 AND abs("lineTotal") < 1e12 AND "lineTotal"::numeric <> round("lineTotal"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "StockPurchaseItem" GROUP BY "tenantId"
UNION ALL
SELECT 'StockMovement.unitCost' AS columna, "tenantId" AS negocio, count("unitCost") AS filas,
       count(*) FILTER (WHERE "unitCost" = 'NaN'::float8 OR "unitCost" IN ('Infinity'::float8, '-Infinity'::float8) OR abs("unitCost") >= 1e12) AS no_entran,
       count(*) FILTER (WHERE "unitCost" <> 'NaN'::float8 AND abs("unitCost") < 1e12 AND "unitCost"::numeric <> round("unitCost"::numeric, 2)) AS con_fraccion_de_centavo
  FROM "StockMovement" GROUP BY "tenantId"
ORDER BY no_entran DESC, con_fraccion_de_centavo DESC, columna, negocio;
