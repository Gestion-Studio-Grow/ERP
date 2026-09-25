BEGIN;
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "cotizacion";
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['Tenant','Order','Payment','Collection','CashSession','CashMovement','CommissionPayout',
                           'StockPurchase','AccountPayable','PayableCheque','AccountReceivable','MovimientoImportado','Invoice']
  LOOP EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS "moneda"', t); END LOOP;
END $$;
DROP TYPE IF EXISTS "Moneda";
COMMIT;
