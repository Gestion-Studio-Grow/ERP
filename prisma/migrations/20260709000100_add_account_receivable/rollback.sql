-- ROLLBACK de D3 (add_account_receivable). Manual (§C).
-- Revierte solo la tabla. NO dropea `DebtStatus` (lo comparte con D2/AccountPayable).

DROP TABLE IF EXISTS "AccountReceivable";
