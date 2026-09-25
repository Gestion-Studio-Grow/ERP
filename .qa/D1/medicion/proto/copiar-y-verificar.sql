\timing on
-- Copia por lotes (acá uno solo; en Neon, por negocio y de a 5.000 filas). El UPDATE que sólo
-- toca la columna nueva dispara el trigger, que la deja como está (cambió la nueva: la vieja se
-- recalcula desde la nueva, que es round(vieja,2): la Float queda con el valor redondeado).
UPDATE "CashMovement" SET "amountDec" = round(amount::numeric, 2) WHERE "amountDec" IS NULL;
UPDATE "Order" SET "subtotalDec" = round(subtotal::numeric,2), "discountDec" = round(discount::numeric,2), "totalDec" = round(total::numeric,2) WHERE "totalDec" IS NULL;
-- Verificación fila por fila y por negocio
SELECT 'CashMovement.amount' col, "tenantId", count(amount) n_viejo, count("amountDec") n_nuevo,
       sum(round(amount::numeric,2)) suma_viejo_redondeado, sum("amountDec") suma_nueva,
       sum(amount::numeric) - sum("amountDec") dif_contra_float,
       count(*) filter (where "amountDec" IS DISTINCT FROM round(amount::numeric,2)) filas_distintas
  FROM "CashMovement" GROUP BY "tenantId" ORDER BY 2;
SELECT 'Order.total' col, "tenantId", count(total) n_viejo, count("totalDec") n_nuevo, sum(round(total::numeric,2)) s_v, sum("totalDec") s_n,
       count(*) filter (where "totalDec" IS DISTINCT FROM round(total::numeric,2) or "subtotalDec" IS DISTINCT FROM round(subtotal::numeric,2) or "discountDec" IS DISTINCT FROM round(discount::numeric,2)) filas_distintas
  FROM "Order" GROUP BY "tenantId" ORDER BY 2;
