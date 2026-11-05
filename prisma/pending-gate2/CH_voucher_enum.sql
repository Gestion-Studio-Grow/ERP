-- ============================================================================
-- CH_voucher_enum — PaymentMethod.VOUCHER (vouchers de La Alameda que liquida OpenKey · CH Estética)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño)
-- ============================================================================
--
-- QUIÉN LA USA: src/lib/vouchers (cobro de un turno con voucher). Orden del dueño 05/11/2026: el
-- voucher ES un cobro y un medio de pago, y se concilia con la LIQUIDACIÓN que paga OpenKey.
-- Diseño: docs/tenants/ch/VOUCHERS-OPENKEY.md. Las TABLAS (VoucherLote, Voucher,
-- VoucherConciliacion) van aparte, en la migración aditiva prisma/migrations/20261105120000_vouchers.
--
-- 🔴 IRREVERSIBLE: Postgres no tiene `ALTER TYPE … DROP VALUE`. El nombre se fija ANTES de aplicar.
--
-- ⚠️ CÓMO SE APLICA: SIN BEGIN/COMMIT a propósito (mismo criterio que N2_enums.sql). El valor nuevo
-- no se puede usar en la misma transacción que lo agrega; se corre con
-- `psql -v ON_ERROR_STOP=1 -f CH_voucher_enum.sql` SIN `--single-transaction`.
--
-- ORDEN: el cliente de Prisma YA conoce el valor (`VOUCHER // CH-enum-encendido:` en schema.prisma),
-- así que leer una fila con VOUCHER no rompe ningún build desplegado con ese schema. El código lo
-- escribe sólo si `sePuedeEscribirValorEnum("PaymentMethod", "VOUCHER")` está en true Y el
-- interruptor «vouchers» del negocio está prendido. Sin este archivo aplicado, cobrar con voucher
-- se rechaza con un mensaje claro y nada se escribe.
--
-- EL LIBRO DE CAJA NO LO VE: `cashMethodFromPaymentMethod("VOUCHER")` = null → el cobro no asienta
-- (`unsupported-method`) y el cierre del día lo muestra como renglón propio «Voucher», a cobrar a
-- OpenKey, nunca sumado al efectivo ni al esperado del cajón.

-- Paso 1 · Medio de pago VOUCHER.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'VOUCHER';

-- Post-check (aparte):
--   SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname = 'PaymentMethod' ORDER BY e.enumsortorder;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA (leer antes de usar) — 🔴 no hay reversa automática
-- ─────────────────────────────────────────────────────────────────────────────
-- La reversa práctica es DEJAR el valor: es inocuo mientras ninguna fila lo use (apagar el
-- interruptor «vouchers» frena toda escritura). Sacarlo de verdad es recrear el tipo (otro Gate 2,
-- en ventana, ver el pie de N2_enums.sql), previa verificación:
--   SELECT count(*) FROM "Payment"    WHERE method::text = 'VOUCHER';
--   SELECT count(*) FROM "Order"      WHERE "paymentMethod"::text = 'VOUCHER';
--   SELECT count(*) FROM "Collection" WHERE method::text = 'VOUCHER';
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
