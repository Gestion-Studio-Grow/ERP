-- Motor de facturación · clave de origen genérica (PR1). PREPARADA, SIN APLICAR (Gate 2: la autoriza el dueño).
-- Ensancha el CHECK del libro de cobros facturados para admitir `manual:<clave>` (`mp:refund:<id>` ya entra por `mp:`).
-- Aditiva en la práctica: todo lo que hoy pasa el CHECK lo sigue pasando. Requiere 20261022150000_cobro_facturado.
-- Reversa: volver al CHECK '^(mp|turno|banco):.+$' (falla si ya hay filas manual:, que habría que mirar antes).
ALTER TABLE "CobroFacturado" DROP CONSTRAINT IF EXISTS "CobroFacturado_clave_check";
ALTER TABLE "CobroFacturado" ADD CONSTRAINT "CobroFacturado_clave_check"
  CHECK ("clave" ~ '^(mp|turno|banco|manual):.+$') NOT VALID;
ALTER TABLE "CobroFacturado" VALIDATE CONSTRAINT "CobroFacturado_clave_check";
