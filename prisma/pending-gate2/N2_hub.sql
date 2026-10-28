-- ============================================================================
-- N2_hub — Hub de automatizaciones: API keys, webhooks salientes, plantillas de WhatsApp
--          y versión/clave del outbox (paso 3 de 7 del paquete Gate 2)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01) · ADR-018
-- ============================================================================
--
-- QUIÉN LA USA: P2 (OutboxEvent.version / OutboxEvent.clave: catálogo de eventos v1 con
-- clave de deduplicación por negocio) · P3 (WebhookSuscripcion + EntregaWebhook: webhooks
-- salientes firmados; índice del despachante) · P4 (ApiKey con alcances) · P6
-- (PlantillaWhatsapp por conexión). Diseño: PLAN-REINGENIERIA-N2 §4.1.2–§4.1.6 y §4.3.
--
-- ADITIVA: crea 4 tablas y agrega 2 columnas al OutboxEvent (una con DEFAULT 1, otra
-- NULLABLE) + 3 índices. No toca columnas existentes ni borra nada. Los eventos de ARCA de
-- hoy siguen igual (version=1, clave=NULL; los NULL no chocan en el UNIQUE).
-- IDEMPOTENTE: IF NOT EXISTS en tablas/columnas/índices y guardas DO para las FKs.
-- Corre en UNA transacción (BEGIN/COMMIT): si algo falla no queda a medias.
--
-- TOLERANCIA DEL CÓDIGO (sin aplicar): src/lib/schema-probe → hayTabla("ApiKey") false =
-- P4 sigue con la clave por variable de entorno; hayTabla("WebhookSuscripcion") false = el
-- despachante sólo atiende conectores; hayTabla("PlantillaWhatsapp") false = catálogo en
-- código; hayColumna("OutboxEvent","clave") false = sin dedupe por clave (como hoy).
--
-- Convención de nombres = la de Prisma (Modelo_col_idx / _key / _fkey) para que
-- `prisma db pull` coincida con los modelos comentados de schema.prisma (marca `// N2:`).
-- Plata: no hay montos en este archivo.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1 · ApiKey — claves de la API pública con alcances (P4, §4.1.4)
-- ─────────────────────────────────────────────────────────────────────────────
-- `prefijo`: parte visible ("gsg_live_ab12cd"), ÚNICA en toda la base porque la búsqueda
-- se hace ANTES de saber el negocio (como IntegracionConexion.rutaHash). `hash`: sha256 de
-- la clave completa (la clave se muestra una sola vez y no se guarda). `alcances`:
-- "pedidos:escribir", "turnos:leer"… Revocada = `revocadaEn` no nula.
-- ⚠️ TRASPASADO A P4 (cert. S2): con la app como `app_rls`, la RLS esconde la fila hasta setear
-- el negocio, así que buscar por prefijo ANTES de conocer el negocio no encuentra nada. Es
-- intencional que la tabla nazca con RLS (fail-closed: una clave no se puede leer sin
-- contexto); el camino de resolución previo al contexto es diseño de P4, que es quien
-- autentica con la clave (ver cómo resuelve hoy `IntegracionConexion.rutaHash`). Este archivo
-- no lo resuelve a propósito: relajar la policy acá abriría las claves de todos los negocios.
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "alcances" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiraEn" TIMESTAMP(3),
    "ultimoUsoEn" TIMESTAMP(3),
    "revocadaEn" TIMESTAMP(3),
    "creadaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_prefijo_key" ON "ApiKey"("prefijo");
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_hash_key" ON "ApiKey"("hash");
CREATE INDEX IF NOT EXISTS "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");

DO $$ BEGIN
  ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2 · WebhookSuscripcion — a dónde manda el negocio sus eventos (P3, §4.1.6)
-- ─────────────────────────────────────────────────────────────────────────────
-- Cuelga de una IntegracionConexion (conector "webhook") DEL MISMO negocio: la FK compuesta
-- (tenantId, conexionId) → IntegracionConexion(tenantId, id) impide apuntar a la conexión de
-- otro. El secreto de firma vive en IntegracionCredencial(campo="webhook_secret"), no acá.
-- `eventos`: patrones ("pedido.*", "turno.reservado@1"). 410 del destino → `pausadaEn`.
CREATE TABLE IF NOT EXISTS "WebhookSuscripcion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conexionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "incluyeDatosPersonales" BOOLEAN NOT NULL DEFAULT false,
    "pausadaEn" TIMESTAMP(3),
    "motivoPausa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSuscripcion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebhookSuscripcion_tenantId_id_key" ON "WebhookSuscripcion"("tenantId", "id");
CREATE INDEX IF NOT EXISTS "WebhookSuscripcion_tenantId_idx" ON "WebhookSuscripcion"("tenantId");
CREATE INDEX IF NOT EXISTS "WebhookSuscripcion_tenantId_activa_idx" ON "WebhookSuscripcion"("tenantId", "activa");

DO $$ BEGIN
  ALTER TABLE "WebhookSuscripcion" ADD CONSTRAINT "WebhookSuscripcion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WebhookSuscripcion" ADD CONSTRAINT "WebhookSuscripcion_tenantId_conexionId_fkey" FOREIGN KEY ("tenantId", "conexionId") REFERENCES "IntegracionConexion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3 · EntregaWebhook — un intento de entrega (P3-C5)
-- ─────────────────────────────────────────────────────────────────────────────
-- Una fila por intento: estado HTTP, duración, respuesta recortada/redactada. `outboxEventId`
-- nulo = "probar envío" desde la pantalla. DOBLE ENVÍO: el UNIQUE (tenantId, suscripcionId,
-- outboxEventId, intento) hace que dos workers que toman el mismo evento no registren dos
-- veces el mismo intento (el segundo INSERT choca → ON CONFLICT DO NOTHING en P3).
CREATE TABLE IF NOT EXISTS "EntregaWebhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "suscripcionId" TEXT NOT NULL,
    "outboxEventId" TEXT,
    "evento" TEXT NOT NULL,
    "intento" INTEGER NOT NULL DEFAULT 1,
    "estadoHttp" INTEGER,
    "duracionMs" INTEGER,
    "respuesta" TEXT,
    "error" TEXT,
    "entregadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntregaWebhook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EntregaWebhook_tenantId_suscripcionId_outboxEventId_intento_key" ON "EntregaWebhook"("tenantId", "suscripcionId", "outboxEventId", "intento");
CREATE INDEX IF NOT EXISTS "EntregaWebhook_tenantId_idx" ON "EntregaWebhook"("tenantId");
CREATE INDEX IF NOT EXISTS "EntregaWebhook_tenantId_suscripcionId_createdAt_idx" ON "EntregaWebhook"("tenantId", "suscripcionId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "EntregaWebhook" ADD CONSTRAINT "EntregaWebhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "EntregaWebhook" ADD CONSTRAINT "EntregaWebhook_tenantId_suscripcionId_fkey" FOREIGN KEY ("tenantId", "suscripcionId") REFERENCES "WebhookSuscripcion"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- → OutboxEvent: ON DELETE CASCADE (cert. S2, falla baja de la vuelta 1). La entrega es el
-- registro de los intentos de UN evento: sin el evento no significa nada (igual que su FK a la
-- suscripción, que ya es CASCADE). Con RESTRICT, el reseteo de go-live
-- (src/lib/reset-golive-db.ts, `outboxEvent.deleteMany`) y cualquier purga del outbox fallaban
-- en cuanto el hub registrara una entrega. Por qué no las otras dos opciones:
--   · SET NULL: la FK es compuesta (tenantId, outboxEventId); el SET NULL simple pondría
--     tenantId en NULL (NOT NULL → error) y la forma con lista de columnas (PG 15+) no se
--     puede expresar en schema.prisma (diff permanente). Además NULL ya significa
--     "probar envío" y se mezclarían las dos cosas.
--   · borrar las entregas antes en cada purga: obliga a todo camino que borre eventos (hoy el
--     reseteo, mañana la purga por antigüedad y el operador) a conocer una tabla que el
--     cliente de Prisma todavía no tiene; el que se olvide, falla.
-- El CASCADE sigue el par (tenantId, id): sólo borra entregas del MISMO negocio.
-- Traspasado a P3: al encender el modelo, sumar EntregaWebhook a ORDEN_DE_BORRADO
-- (src/lib/reset-golive.ts) antes de OutboxEvent, para que el reseteo las CUENTE en su
-- auditoría (hoy se irían "de rebote" sin contarse; no falla ni deja huérfanos).
-- Guarda convergente: si la FK ya existe con otra acción (un ensayo con la versión anterior
-- en un branch de Neon), se reemplaza; si ya es CASCADE, no se toca.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'EntregaWebhook_tenantId_outboxEventId_fkey'
               AND conrelid = '"EntregaWebhook"'::regclass AND confdeltype <> 'c') THEN
    ALTER TABLE "EntregaWebhook" DROP CONSTRAINT "EntregaWebhook_tenantId_outboxEventId_fkey";
  END IF;
  ALTER TABLE "EntregaWebhook" ADD CONSTRAINT "EntregaWebhook_tenantId_outboxEventId_fkey" FOREIGN KEY ("tenantId", "outboxEventId") REFERENCES "OutboxEvent"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4 · PlantillaWhatsapp — plantillas aprobadas en Meta, por conexión (P6, §4.3)
-- ─────────────────────────────────────────────────────────────────────────────
-- `clave`: nombre interno ("recordatorio_turno"); `nombreMeta`: el aprobado en Meta;
-- `variables`: mapeo {{1}} → campo. `estado`: pendiente | aprobada | rechazada | pausada.
CREATE TABLE IF NOT EXISTS "PlantillaWhatsapp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conexionId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombreMeta" TEXT NOT NULL,
    "idioma" TEXT NOT NULL DEFAULT 'es_AR',
    "categoria" TEXT NOT NULL DEFAULT 'utility',
    "variables" JSONB,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlantillaWhatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlantillaWhatsapp_tenantId_conexionId_clave_idioma_key" ON "PlantillaWhatsapp"("tenantId", "conexionId", "clave", "idioma");
CREATE INDEX IF NOT EXISTS "PlantillaWhatsapp_tenantId_idx" ON "PlantillaWhatsapp"("tenantId");

DO $$ BEGIN
  ALTER TABLE "PlantillaWhatsapp" ADD CONSTRAINT "PlantillaWhatsapp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PlantillaWhatsapp" ADD CONSTRAINT "PlantillaWhatsapp_tenantId_conexionId_fkey" FOREIGN KEY ("tenantId", "conexionId") REFERENCES "IntegracionConexion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §5 · OutboxEvent — versión del evento, clave de dedupe e índice del despachante (P2, P3)
-- ─────────────────────────────────────────────────────────────────────────────
-- `version`: versión del contrato del evento (pedido.creado@1). DEFAULT 1 → las filas de hoy
-- quedan en 1 sin reescribir la tabla (default constante: Postgres 11+ no la reescribe).
-- `clave`: dedupe por negocio (`@@unique(tenantId, clave)`): emitir dos veces el mismo hecho
-- (doble clic, reintento) deja UN evento. NULL = sin dedupe (los eventos de ARCA de hoy).
-- Índice (tenantId, processedAt, proximoIntentoEn): la consulta del despachante por negocio.
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "OutboxEvent" ADD COLUMN IF NOT EXISTS "clave" TEXT;

-- Backfill ANTES del UNIQUE: los eventos emitidos sin esta migración llevan la clave en
-- `payload._clave` y la columna en NULL; sin copiarla, el UNIQUE no los ve y reemitir el mismo
-- hecho después del deploy escribiría una segunda fila. Idempotente (sólo toca los NULL).
-- Corre como dueño (sin FORCE RLS, como hoy); si se aplicó 0003_force_rls, con un rol BYPASSRLS.
-- Sin NOT EXISTS a propósito: acá todavía no está el UNIQUE y cada fila recorrería la tabla
-- (cuadrático). Si hubiera dos filas del mismo hecho, el CREATE UNIQUE INDEX de abajo falla y
-- la transacción entera vuelve atrás: no queda nada a medias (se avisa, no se borra).
UPDATE "OutboxEvent" SET "clave" = "payload"->>'_clave'
  WHERE "clave" IS NULL AND "payload" ? '_clave';

CREATE UNIQUE INDEX IF NOT EXISTS "OutboxEvent_tenantId_clave_key" ON "OutboxEvent"("tenantId", "clave");
-- Dedupe sin recorrer el outbox (CERT-P2 v2-d: 46,9 ms por emisión con 200k filas). El emisor
-- busca `"clave" = $c OR ("clave" IS NULL AND "payload"->>'clave' = $c)`: la primera rama va
-- por el UNIQUE y la segunda por este índice PARCIAL, que sólo guarda las filas con clave NULL
-- (los InvoiceCreated de ARCA y lo emitido antes de esta migración). Chico y sin costo de
-- escritura para las filas nuevas, que llevan clave.
CREATE INDEX IF NOT EXISTS "OutboxEvent_tenantId_payloadClave_sinClave_idx" ON "OutboxEvent"("tenantId", ("payload"->>'clave')) WHERE "clave" IS NULL;
CREATE INDEX IF NOT EXISTS "OutboxEvent_tenantId_processedAt_proximoIntentoEn_idx" ON "OutboxEvent"("tenantId", "processedAt", "proximoIntentoEn");

-- ─────────────────────────────────────────────────────────────────────────────
-- §6 · RLS de las 4 tablas nuevas (misma policy que prisma/rls/0001_enable_rls.sql)
-- ─────────────────────────────────────────────────────────────────────────────
-- Explícita para que aplicar este archivo PROTEJA las tablas en el mismo acto; el paso 7
-- (re-ejecutar 0001) la vuelve a poner igual. Idempotente. Fail-closed sin contexto.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ApiKey','WebhookSuscripcion','EntregaWebhook','PlantillaWhatsapp']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
      || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      t
    );
  END LOOP;
END $$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO POSTERIOR (dos minutos después de aplicar, con la app ya corriendo): un proceso que
-- preguntó por las columnas ANTES de la migración guarda «no están» 60 s (TTL_NEGATIVO_MS de
-- src/lib/schema-probe/probe.ts) y en ese rato escribe eventos con `clave` NULL y la clave en
-- `payload._clave`. El emisor los ve igual (índice parcial de arriba), pero el UNIQUE no. Volver
-- a correr el backfill los completa; es idempotente, el NOT EXISTS va por el UNIQUE (no recorre
-- la tabla) y deja afuera la fila de un hecho que ya tiene su clave:
--   UPDATE "OutboxEvent" AS o SET "clave" = o."payload"->>'_clave'
--     WHERE o."clave" IS NULL AND o."payload" ? '_clave'
--       AND NOT EXISTS (SELECT 1 FROM "OutboxEvent" AS d WHERE d."tenantId" = o."tenantId" AND d."clave" = o."payload"->>'_clave')
--       AND NOT EXISTS (SELECT 1 FROM "OutboxEvent" AS e WHERE e."tenantId" = o."tenantId" AND e."clave" IS NULL
--                       AND e."payload"->>'_clave' = o."payload"->>'_clave' AND e.id < o.id);
-- El segundo NOT EXISTS (pase N2, cert. F11): de dos filas tardías del MISMO hecho completa sólo
-- una (la de id menor) en vez de fallar entero por el UNIQUE y dejar sin clave a las legítimas.
-- Esperado: «UPDATE 0» o pocas filas. Una fila que queda con clave NULL y `_clave` es un duplicado:
-- avisar (no borrar). Listarlas: SELECT id, "tenantId", "payload"->>'_clave' FROM "OutboxEvent"
--   WHERE "clave" IS NULL AND "payload" ? '_clave';

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA (orden inverso; correr en una transacción). Borra los datos de estas tablas:
-- sólo si el humo falló el mismo día D, antes de que el Hub cargue claves o suscripciones.
--   BEGIN;
--   DROP INDEX IF EXISTS "OutboxEvent_tenantId_processedAt_proximoIntentoEn_idx";
--   DROP INDEX IF EXISTS "OutboxEvent_tenantId_payloadClave_sinClave_idx";
--   DROP INDEX IF EXISTS "OutboxEvent_tenantId_clave_key";
--   ALTER TABLE "OutboxEvent" DROP COLUMN IF EXISTS "clave";
--   ALTER TABLE "OutboxEvent" DROP COLUMN IF EXISTS "version";
--   DROP TABLE IF EXISTS "PlantillaWhatsapp";
--   DROP TABLE IF EXISTS "EntregaWebhook";
--   DROP TABLE IF EXISTS "WebhookSuscripcion";
--   DROP TABLE IF EXISTS "ApiKey";
--   COMMIT;
-- Modelos para schema.prisma: bloques `// N2:` (N2_hub) de prisma/schema.prisma.
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
