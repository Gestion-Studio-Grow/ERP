-- D1 · M-D1-0 · MONEDA (aditiva, instantánea: ADD COLUMN con valor por defecto constante no reescribe la tabla).
-- Toda fila que registra un hecho de plata dice en qué moneda está. Hoy todo es ARS y un CHECK lo hace
-- cumplir: el código que todavía no mira la moneda es correcto mientras el CHECK exista. Sacarlo es
-- decidir operar otra moneda (ADR aparte).
DO $moneda$
DECLARE t text;
BEGIN
  CREATE TYPE "Moneda" AS ENUM ('ARS', 'USD');
  -- La moneda de las cuentas del negocio: la usan precios, costos y cupones, que no llevan columna propia.
  ALTER TABLE "Tenant" ADD COLUMN "moneda" "Moneda" NOT NULL DEFAULT 'ARS';
  FOREACH t IN ARRAY ARRAY['Order', 'Payment', 'Collection', 'CashSession', 'CashMovement', 'CommissionPayout',
                           'StockPurchase', 'AccountPayable', 'PayableCheque', 'AccountReceivable',
                           'MovimientoImportado', 'Invoice']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN "moneda" "Moneda" NOT NULL DEFAULT %L', t, 'ARS');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ("moneda" = %L)', t, t || '_moneda_ars', 'ARS');
  END LOOP;
  -- WSFEv1 MonCotiz: Double (4 enteros + 6 decimales); para pesos (PES) tiene que ser 1.
  ALTER TABLE "Invoice" ADD COLUMN "cotizacion" numeric(10,6) NOT NULL DEFAULT 1;
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cotizacion_pesos" CHECK ("moneda" <> 'ARS' OR "cotizacion" = 1);
END
$moneda$;
