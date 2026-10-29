-- ============================================================================
-- N2_modulo_mercadopago — prende `mercadopago` en Tenant.modules para TODOS los negocios
--                         (paso 0 bis del paquete: JUSTO ANTES del push a main, y sólo con la
--                         precondición cumplida)
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
-- Con la precondición cumplida, el código viejo (que con el módulo arma el link con el token global)
-- expone lo mismo que el nuevo con MP_MODO_LEGADO=1: por eso va JUSTO ANTES del push y no después.
-- Después, S1/P1 contestan 200 a un aviso de un negocio sin el módulo (mercadopago-dispatch.ts) y MP
-- NO lo reintenta (cert. del pase, vuelta 2, O-1): correrlo después dejaría avisos perdidos.
-- Sin la precondición cumplida, NO se corre y S1/P1 no se publican hasta que el dueño decida.
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

-- Sin `public` en el camino: un rol con CREATE en public no puede meter un `@>` propio que gane la
-- resolución y corra como el dueño (cert. del pase, vuelta 2, O-2).
SET LOCAL search_path = pg_catalog, pg_temp;

-- Los negocios que cambian, exactamente (no un SELECT previo: ese podía no coincidir con el UPDATE).
UPDATE public."Tenant"
   SET "modules" = array_append(COALESCE("modules", '{}'::text[]), 'mercadopago')
 WHERE NOT (COALESCE("modules", '{}'::text[]) @> ARRAY['mercadopago'])
RETURNING slug, status, "modules";

-- Tiene que quedar ninguno sin el módulo: si no, falla y (con ON_ERROR_STOP) no se confirma nada.
DO $$
DECLARE faltan int;
BEGIN
  SELECT count(*) INTO faltan FROM public."Tenant" WHERE NOT (COALESCE("modules", '{}'::text[]) @> ARRAY['mercadopago']);
  IF faltan > 0 THEN
    RAISE EXCEPTION 'N2_modulo_mercadopago: % negocio(s) siguen sin mercadopago', faltan;
  END IF;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- NEGOCIOS NUEVOS (cert. F6): los presets no traen `mercadopago` (src/blueprints/presets-meta.ts):
-- un negocio dado de alta después del día D nace sin el módulo y S1/P1 descartan sus avisos de MP.
-- Decisión del dueño PENDIENTE: sumarlo a los presets, o que conectar MP lo prenda.
-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA: 🔴 sólo si main vuelve a un código ANTERIOR a S1/P1 (con S1/P1 desplegados, sacar el
-- módulo corta los avisos de MP de esos negocios: cobros que no se acreditan). Y sólo para los
-- slugs que devolvió el RETURNING del día D; nunca de todos (hay negocios que ya lo tenían).
--   BEGIN;
--   UPDATE public."Tenant" SET "modules" = array_remove("modules", 'mercadopago')
--    WHERE slug IN ('<slug>', '<slug>');
--   COMMIT;
