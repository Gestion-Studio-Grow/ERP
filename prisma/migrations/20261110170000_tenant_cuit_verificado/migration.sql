-- CUIT verificado del alta web de Factoque (D4 del dueño, 09/11/2026 23:50): el CUIT queda «sin verificar» hasta
-- que el titular conecta ARCA, y el alta sin verificar vence a los 15 días. Verificado = ARCA de PRODUCCIÓN aceptó el
-- certificado del negocio (sólo lo saca el titular con su clave fiscal). Esta columna guarda cuándo, para que el
-- estado no dependa sólo de la auditoría (src/lib/fiscal/tenant-cert.ts → registrarPruebaArcaOk).
--
-- ADITIVA: una columna nullable en "Tenant", sin default y sin backfill (no toca datos). Idempotente
-- (`IF NOT EXISTS`). RLS: viaja en la fila de "Tenant", que ya tiene su policy; no suma superficie.
--
-- Sin aplicar (Gate 2), el código sigue verificando por la auditoría (fiscal.arca.prueba-ok de producción):
-- la lee con SQL crudo después de preguntar a information_schema si existe (tenedores-del-cuit.server.ts).
--
-- Vuelta atrás: ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "cuitVerificadoEn";

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "cuitVerificadoEn" TIMESTAMP(3);
