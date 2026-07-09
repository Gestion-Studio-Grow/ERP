-- ROLLBACK de D2 (add_account_payable). Manual (§C). Orden inverso.
-- Revierte estructura pura (sin datos dependientes).

-- Tablas (PayableCheque primero por la FK a AccountPayable).
DROP TABLE IF EXISTS "PayableCheque";
DROP TABLE IF EXISTS "AccountPayable";

-- Enums propios de D2.
DROP TYPE IF EXISTS "ChequeStatus";
DROP TYPE IF EXISTS "DebtStatus";  -- ⚠️ NO ejecutar si D3 (AccountReceivable) sigue vivo: lo comparte.

-- ⚠️ El valor 'PAYABLE' agregado a "CollectionOriginType" NO se puede quitar con un simple
--    ALTER (Postgres no soporta DROP VALUE). Es INOCUO dejarlo (nadie lo usa si no hay AP).
--    Revertirlo requeriría recrear el enum sin ese valor y migrar la columna — no vale la pena.
