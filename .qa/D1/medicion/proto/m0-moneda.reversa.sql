-- Reversa de M-D1-0: borra las columnas de moneda y el tipo. No pierde nada: hasta que exista otra moneda, todas dicen ARS.
DO $reversa$
DECLARE t text;
BEGIN
  ALTER TABLE "Invoice" DROP COLUMN "cotizacion";
  FOREACH t IN ARRAY ARRAY['Tenant', 'Order', 'Payment', 'Collection', 'CashSession', 'CashMovement', 'CommissionPayout',
                           'StockPurchase', 'AccountPayable', 'PayableCheque', 'AccountReceivable',
                           'MovimientoImportado', 'Invoice']
  LOOP
    EXECUTE format('ALTER TABLE %I DROP COLUMN "moneda"', t);
  END LOOP;
  DROP TYPE "Moneda";
END
$reversa$;
