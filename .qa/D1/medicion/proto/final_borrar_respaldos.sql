-- D1 · final · DESTRUCTIVA (con su propio OK): se borran los respaldos Float.
BEGIN;
ALTER TABLE "Service" DROP COLUMN "price_float", DROP COLUMN "residentPrice_float", DROP COLUMN "depositAmount_float";
ALTER TABLE "Product" DROP COLUMN "price_float", DROP COLUMN "pricePerKg_float";
ALTER TABLE "Appointment" DROP COLUMN "priceAtBooking_float", DROP COLUMN "discountAmount_float";
ALTER TABLE "CommissionPayout" DROP COLUMN "amount_float";
ALTER TABLE "Payment" DROP COLUMN "amount_float";
ALTER TABLE "Coupon" DROP COLUMN "value_float";
ALTER TABLE "Order" DROP COLUMN "subtotal_float", DROP COLUMN "discount_float", DROP COLUMN "total_float";
ALTER TABLE "OrderItem" DROP COLUMN "unitPrice_float", DROP COLUMN "lineTotal_float";
ALTER TABLE "CashSession" DROP COLUMN "openingFloat_float", DROP COLUMN "closingExpected_float", DROP COLUMN "closingCounted_float", DROP COLUMN "closingDiff_float";
ALTER TABLE "CashMovement" DROP COLUMN "amount_float";
ALTER TABLE "StockPurchase" DROP COLUMN "totalCost_float";
ALTER TABLE "StockPurchaseItem" DROP COLUMN "unitCost_float", DROP COLUMN "lineTotal_float";
ALTER TABLE "StockMovement" DROP COLUMN "unitCost_float";
COMMIT;
