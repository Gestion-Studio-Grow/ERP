-- Reingeniería CH, Tanda 3 · M1 — Débito y Crédito como medios de pago (CH-031/CH-032).
--
-- SOLA EN SU MIGRACIÓN, a propósito: Postgres no deja USAR un valor de enum recién agregado
-- dentro de la misma transacción que lo agrega («unsafe use of new value»). Prisma corre cada
-- migración en su transacción; con los dos ADD VALUE solos acá, ninguna sentencia de esta
-- migración ni de la siguiente usa los valores nuevos antes del COMMIT.
--
-- Aditiva: agrega dos etiquetas al enum. No cambia ninguna fila (ningún cobro existente pasa a
-- ser tarjeta) y no reescribe la tabla. Mientras NO esté aplicada, el código no ofrece ni escribe
-- DEBITO/CREDITO (`mediosDePagoHabilitados` lee pg_enum; `medioHabilitado` filtra) y la tarjeta
-- se sigue registrando como Mercado Pago (placeholder D6 del diseño).
--
-- `IF NOT EXISTS`: si alguien la aplicó a mano (camino B) y después corre `migrate deploy`, no
-- falla por valor duplicado.
--
-- SIN APLICAR en Neon y fuera de prisma/lote-deploy.txt: la aplica el dueño (Gate 2).

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'DEBITO';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDITO';
