-- D1 · paso 1b · MONEDA (aditiva). Toda fila que registra plata dice en qué moneda está.
-- Hoy todo es ARS y un CHECK lo hace cumplir: el código que todavía no mira la moneda es
-- correcto mientras el CHECK exista, y sacarlo es la decisión (con ADR) de operar otra moneda.
BEGIN;
CREATE TYPE "Moneda" AS ENUM ('ARS', 'USD');
ALTER TABLE "Tenant" ADD COLUMN "moneda" "Moneda" NOT NULL DEFAULT 'ARS';
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['Order','Payment','Collection','CashSession','CashMovement','CommissionPayout',
                           'StockPurchase','AccountPayable','PayableCheque','AccountReceivable',
                           'MovimientoImportado','Invoice']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN "moneda" "Moneda" NOT NULL DEFAULT %L', t, 'ARS');
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ("moneda" = %L)', t, t || '_moneda_ars', 'ARS');
  END LOOP;
END $$;
-- ARCA pide la cotización con hasta 6 decimales (MonCotiz, Double 4+6); para PES tiene que ser 1.
ALTER TABLE "Invoice" ADD COLUMN "cotizacion" numeric(10,6) NOT NULL DEFAULT 1;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cotizacion_ars" CHECK ("moneda" <> 'ARS' OR "cotizacion" = 1);
COMMIT;
