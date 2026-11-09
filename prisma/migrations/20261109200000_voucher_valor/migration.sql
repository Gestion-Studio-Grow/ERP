-- Valor del voucher configurable por negocio (CH · La Alameda, orden del dueño 09/11/2026). Con valor, un
-- voucher cubre min(valor, saldo del turno) y un monto escrito a mano no puede pasarlo; sin valor (NULL),
-- cubre el saldo, como hasta ahora.
--
-- ADITIVA: una columna NULLABLE en "BusinessSettings", sin default ni backfill; no toca datos. El CHECK
-- sólo mira la columna nueva (NULL pasa). Idempotente (`IF NOT EXISTS` y el CHECK con su guarda).
-- RLS: viaja en la fila de "BusinessSettings", que ya tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2), el código lee la columna con SQL crudo tolerante (src/lib/vouchers/valor-voucher.ts):
-- ausente = sin valor, y la pantalla avisa que falta un paso de base de datos para guardarlo.
--
-- Vuelta atrás: ALTER TABLE "BusinessSettings" DROP CONSTRAINT IF EXISTS "BusinessSettings_voucherValor_positivo";
--               ALTER TABLE "BusinessSettings" DROP COLUMN IF EXISTS "voucherValor";

ALTER TABLE "BusinessSettings" ADD COLUMN IF NOT EXISTS "voucherValor" DECIMAL(14,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BusinessSettings_voucherValor_positivo') THEN
    ALTER TABLE "BusinessSettings"
      ADD CONSTRAINT "BusinessSettings_voucherValor_positivo" CHECK ("voucherValor" IS NULL OR "voucherValor" > 0);
  END IF;
END $$;
