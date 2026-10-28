-- ============================================================================
-- N2_modulo_mercadopago — prende `mercadopago` en Tenant.modules para TODOS los negocios
--                         (paso 0 bis del paquete: ANTES del push a main)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01) · ADR-018
-- ============================================================================
--
-- POR QUÉ: con S1 (src/lib/webhooks/resolver-negocio.ts, `conMercadoPagoActivo`) y P1
-- (src/integraciones/conexiones.server.ts, `conexionesDelConector` filtra `modules has
-- "mercadopago"`), un negocio SIN el módulo deja de procesar sus avisos de pago de Mercado Pago
-- en cuanto ese código se despliega. Decisión del dueño (28/10/2026): todos los negocios cobran
-- con Mercado Pago → se prende en todos.
--
-- CUÁNDO: ANTES del push a main. Es un dato, no un cambio de schema: el código de hoy lo tolera
-- (mercadopago es un plugin sin dependencias, src/modules/descriptors/mercadopago.ts) y así
-- ningún aviso de pago cae entre el deploy y este paso.
--
-- EFECTO VISIBLE: el módulo habilita la pantalla de Cobros (capability `payments:manage`) en los
-- negocios que no lo tenían. Es lo que el dueño confirmó.
--
-- DATOS ENTRE NEGOCIOS: toca TODAS las filas de Tenant a propósito. Sólo AGREGA el valor; no
-- saca ni reordena otros módulos; no toca negocios que ya lo tienen. Tenant no tiene RLS (es la
-- tabla de resolución de negocios), así que corre igual con el rol directo.
--
-- IDEMPOTENTE: la segunda corrida actualiza 0 filas. Una transacción.
-- ============================================================================

BEGIN;

-- Antes: qué negocios cambian (queda en la salida de psql, para el registro del día D).
SELECT slug, status, "modules" FROM "Tenant" WHERE NOT ('mercadopago' = ANY ("modules")) ORDER BY slug;

UPDATE "Tenant"
   SET "modules" = array_append("modules", 'mercadopago')
 WHERE NOT ('mercadopago' = ANY ("modules"));

-- Después: tiene que dar 0.
SELECT count(*) AS sin_mercadopago FROM "Tenant" WHERE NOT ('mercadopago' = ANY ("modules"));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA: sólo para los slugs que listó el primer SELECT (los que NO lo tenían). Nunca quitarlo
-- de todos: hay negocios que ya lo tenían antes del día D.
--   BEGIN;
--   UPDATE "Tenant" SET "modules" = array_remove("modules", 'mercadopago')
--    WHERE slug IN ('<slug>', '<slug>');
--   COMMIT;
