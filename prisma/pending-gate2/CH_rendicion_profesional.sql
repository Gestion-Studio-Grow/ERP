-- ============================================================================
-- CH · Rendición de la profesional que cobra aparte (GSG-CH-006 · D6) — PREPARADA, SIN APLICAR
-- ============================================================================
--
-- Gate 2: lo aplica el dueño (nunca un agente). ADITIVA e IDEMPOTENTE (IF NOT EXISTS + guardas DO):
-- dos tablas nuevas, ninguna columna nueva en tablas vivas, ningún valor de enum.
--
-- Qué resuelve (operación real de CH, sábado 08/11, 7 de 18 turnos): la profesional con
-- `Professional.cobraEnMostrador = false` cobra SUS turnos y la plata queda en su bolsillo, pero el
-- cobro entraba al libro de caja como si estuviera en el cajón y desarmaba el cierre. Con estas
-- tablas el cobro queda «a rendir» (`CobroARendir`) y entra al libro recién cuando la profesional
-- entrega la plata (`RendicionProfesional` + un INGRESO marcado `rendicion:<id>`).
--
-- El código la usa con SQL crudo (src/lib/comisiones/rendicion-repo.ts) y pregunta antes si está
-- (`pg_class`): SIN estas tablas el cobro de la profesional sigue entrando al libro como hoy y la
-- pantalla de Comisiones no muestra la sección. Diseño: docs/producto/comisiones/RENDICION.md.
--
-- ⚠️ Al aplicar: tienen `tenantId` → la policy `tenant_isolation` va acá y la re-pone
-- `prisma/rls/0001_enable_rls.sql`. Los permisos de `app_rls` salen de los DEFAULT PRIVILEGES de
-- `neondb_owner` (prisma/rls/0002_app_role.sql).
--
-- ⚠️⚠️ CORRER COMO `neondb_owner` (la URL de MIGRATE_DATABASE_URL), NUNCA con otro rol. Si la crea
-- otro rol, las tablas existen pero `app_rls` no recibe SELECT/INSERT/UPDATE. El código lo tolera
-- (`hayRendicionesInTx` mira `has_table_privilege` y sin permisos el cobro entra a la caja como hoy),
-- pero la rendición queda apagada hasta corregirlo. Verificación después de aplicar:
--   SELECT has_table_privilege('app_rls', '"CobroARendir"', 'INSERT'),
--          has_table_privilege('app_rls', '"RendicionProfesional"', 'INSERT');   -- los dos: true
-- Si da false: GRANT SELECT, INSERT, UPDATE ON "CobroARendir", "RendicionProfesional" TO app_rls;

BEGIN;

-- La rendición: la profesional entrega al local lo cobrado menos lo que retiene (su comisión o lo
-- acordado). Una fila = una entrega registrada. Nunca se borra (rastro de plata).
CREATE TABLE IF NOT EXISTS "RendicionProfesional" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "professionalId"  TEXT NOT NULL,
  "cobrado"         NUMERIC(14,2) NOT NULL, -- Σ de los cobros que cubre
  "entregado"       NUMERIC(14,2) NOT NULL, -- lo que entró al cajón / cuenta del local
  -- Lo que se quedaría la profesional (comisión adelantada). APAGADO: siempre 0 (CHECK abajo), porque
  -- la liquidación (`settleCommissions`) paga esa comisión igual. Vuelve con la integración (RENDICION.md §Deuda).
  "retenido"        NUMERIC(14,2) NOT NULL DEFAULT 0,
  "method"          TEXT NOT NULL,          -- CashMethod del asiento (texto: sin enum nuevo)
  "idempotencyKey"  TEXT NOT NULL,          -- uuid del formulario: doble envío = una rendición
  "cashMovementId"  TEXT,                   -- el INGRESO del libro (NULL si entregó $0)
  -- La liquidación de comisiones que descontó la retención (integración pendiente, RENDICION.md §4).
  "payoutId"        TEXT,
  "nota"            TEXT,
  "registradaPor"   TEXT NOT NULL,          -- actor "user:<id>"
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "RendicionProfesional_tenantId_idempotencyKey_key" ON "RendicionProfesional"("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "RendicionProfesional_tenantId_professionalId_idx" ON "RendicionProfesional"("tenantId", "professionalId");

-- Nunca se rinde de más ni con montos negativos: la cuenta cierra en la base, no sólo en el código.
DO $$ BEGIN
  ALTER TABLE "RendicionProfesional" ADD CONSTRAINT "RendicionProfesional_montos_ok"
    CHECK ("entregado" >= 0 AND "retenido" >= 0 AND "cobrado" > 0 AND "cobrado" = "entregado" + "retenido");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Retención apagada: se rinde el total. Al integrar la retención con la liquidación se borra este
-- CHECK (DROP CONSTRAINT "RendicionProfesional_sin_retencion"), en la misma migración que lo integre.
DO $$ BEGIN
  ALTER TABLE "RendicionProfesional" ADD CONSTRAINT "RendicionProfesional_sin_retencion" CHECK ("retenido" = 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RendicionProfesional" ADD CONSTRAINT "RendicionProfesional_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RendicionProfesional" ADD CONSTRAINT "RendicionProfesional_professionalId_fkey"
    FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RendicionProfesional" ADD CONSTRAINT "RendicionProfesional_cashMovementId_fkey"
    FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El cobro de turno que quedó a rendir. 1:1 con su `Collection`; `rendicionId` NULL = pendiente.
CREATE TABLE IF NOT EXISTS "CobroARendir" (
  "id"             TEXT PRIMARY KEY,
  "tenantId"       TEXT NOT NULL,
  "collectionId"   TEXT NOT NULL,
  "appointmentId"  TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "monto"          NUMERIC(14,2) NOT NULL,
  "method"         TEXT NOT NULL,           -- PaymentMethod del cobro (texto)
  "rendicionId"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CobroARendir_tenantId_collectionId_key" ON "CobroARendir"("tenantId", "collectionId");
CREATE INDEX IF NOT EXISTS "CobroARendir_tenantId_professionalId_rendicionId_idx" ON "CobroARendir"("tenantId", "professionalId", "rendicionId");

DO $$ BEGIN
  ALTER TABLE "CobroARendir" ADD CONSTRAINT "CobroARendir_monto_positivo" CHECK ("monto" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CobroARendir" ADD CONSTRAINT "CobroARendir_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- RESTRICT con el cobro: es rastro de plata (un cobro rendido no se borra y se lleva su rastro).
-- Ningún flujo normal borra `Collection` (se anula con una contrapartida). Los únicos que borran
-- cobros son de operador: `src/lib/reset-golive-db.ts` y `prisma/seed-magra.ts`; si corren sobre
-- un negocio con cobros a rendir, tienen que borrar antes `CobroARendir` (deuda en RENDICION.md).
DO $$ BEGIN
  ALTER TABLE "CobroARendir" ADD CONSTRAINT "CobroARendir_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CobroARendir" ADD CONSTRAINT "CobroARendir_professionalId_fkey"
    FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Un cobro rendido no pierde su rendición: la rendición no se borra mientras cubra cobros.
DO $$ BEGIN
  ALTER TABLE "CobroARendir" ADD CONSTRAINT "CobroARendir_rendicionId_fkey"
    FOREIGN KEY ("rendicionId") REFERENCES "RendicionProfesional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS (misma policy que prisma/rls/0001_enable_rls.sql; re-correr 0001 la repone igual).
ALTER TABLE "RendicionProfesional" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "RendicionProfesional";
CREATE POLICY tenant_isolation ON "RendicionProfesional"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "CobroARendir" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "CobroARendir";
CREATE POLICY tenant_isolation ON "CobroARendir"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA. ⚠️ Borra el rastro de lo que cada profesional tiene a rendir y de lo rendido. Sólo si
-- todavía no hay filas; si las hay, exportarlas antes (COPY … TO …) — es rastro de plata. Sin las
-- tablas, el código vuelve solo al camino de hoy (el cobro de la profesional entra al libro).
--   BEGIN;
--   DROP TABLE IF EXISTS "CobroARendir";
--   DROP TABLE IF EXISTS "RendicionProfesional";
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
