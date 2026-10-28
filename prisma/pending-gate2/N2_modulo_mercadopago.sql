-- ============================================================================
-- N2_modulo_mercadopago — prende `mercadopago` en Tenant.modules para TODOS los negocios
--                         (paso 0 bis del paquete: INMEDIATAMENTE DESPUÉS de que el deploy de
--                         main esté «Ready»; ver la precondición)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01) · ADR-018
-- ============================================================================
--
-- POR QUÉ: con S1 (src/lib/webhooks/resolver-negocio.ts, `conMercadoPagoActivo`) y P1
-- (src/integraciones/conexiones.server.ts, `conexionesDelConector` filtra `modules has
-- "mercadopago"`), un negocio SIN el módulo deja de procesar sus avisos de pago de Mercado Pago.
-- Decisión del dueño (28/10/2026): todos los negocios cobran con Mercado Pago → se prende en todos.
--
-- 🔴 PRECONDICIÓN (certificación del pase, F1): el módulo hace aparecer «Link de pago» en el
-- negocio. Sin conexión MP propia, el link se arma con el token GLOBAL del despliegue
-- (`MP_ACCESS_TOKEN`): con el código de main de hoy siempre, y con el nuevo sólo si
-- `MP_MODO_LEGADO=1`. Si `MP_MODO` es `test` o `real`, un negocio sin conexión propia cobraría en la
-- cuenta de MP del despliegue (plata de un negocio en la cuenta de otro). Antes de correr esto, el
-- dueño confirma en Vercel prod `MP_MODO`, `MP_ACCESS_TOKEN` (de qué cuenta es), `MP_SIMULAR_AVISOS`
-- y `MP_MODO_LEGADO`, y que cada negocio cobra en SU cuenta (conexión propia o dueño del token).
-- Por eso NO se corre antes del push: con el código viejo, cualquier negocio con el módulo cobra
-- con el token global.
--
-- EFECTO VISIBLE: habilita la pantalla de Cobros (capability `payments:manage`) y «Link de pago».
--
-- DATOS ENTRE NEGOCIOS: toca TODAS las filas de Tenant a propósito. Sólo AGREGA el valor; no saca
-- ni reordena otros módulos; no toca negocios que ya lo tienen. `modules` admite NULL (migración
-- 20260705120000_control_plane_tenant): se trata como vacío. Tenant no tiene RLS.
--
-- IDEMPOTENTE: la segunda corrida actualiza 0 filas. Una transacción. La salida (RETURNING) es la
-- lista EXACTA para la reversa: guardarla (`| tee 0bis-<fecha>.log`).
-- ============================================================================

BEGIN;

-- Los negocios que cambian, exactamente (no un SELECT previo: ese podía no coincidir con el UPDATE).
UPDATE "Tenant"
   SET "modules" = array_append(COALESCE("modules", '{}'::text[]), 'mercadopago')
 WHERE NOT (COALESCE("modules", '{}'::text[]) @> ARRAY['mercadopago'])
RETURNING slug, status, "modules";

-- Tiene que quedar ninguno sin el módulo: si no, falla y (con ON_ERROR_STOP) no se confirma nada.
DO $$
DECLARE faltan int;
BEGIN
  SELECT count(*) INTO faltan FROM "Tenant" WHERE NOT (COALESCE("modules", '{}'::text[]) @> ARRAY['mercadopago']);
  IF faltan > 0 THEN
    RAISE EXCEPTION 'N2_modulo_mercadopago: % negocio(s) siguen sin mercadopago', faltan;
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA: 🔴 sólo si main vuelve a un código ANTERIOR a S1/P1 (con S1/P1 desplegados, sacar el
-- módulo corta los avisos de MP de esos negocios: cobros que no se acreditan). Y sólo para los
-- slugs que devolvió el RETURNING del día D; nunca de todos (hay negocios que ya lo tenían).
--   BEGIN;
--   UPDATE "Tenant" SET "modules" = array_remove("modules", 'mercadopago')
--    WHERE slug IN ('<slug>', '<slug>');
--   COMMIT;
