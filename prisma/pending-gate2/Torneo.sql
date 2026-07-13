-- ============================================================================
-- GATE 2 — MIGRACIÓN PREPARADA, **NO APLICADA** (ADR-097, vertical Torneos / WPE — FASE 2)
-- ============================================================================
--
-- Persiste el estado de un torneo como SNAPSHOT JSONB (uno por torneo), scopeado por
-- tenant con su policy de RLS. Es el reemplazo del `localStorage` de la demo WPE por la
-- infraestructura del ERP (misma base, mismo aislamiento). "Empezá simple" (ADR-097):
-- un snapshot JSONB, SIN normalizar a tablas relacionales — se normaliza recién si
-- aparece una query que lo pida (ranking cross-torneo, etc.), no antes.
--
-- El snapshot es exactamente el output de `motor.serializar(torneo)` (JSON válido); se
-- lee con `motor.deserializar(...)`. Ver src/plugins/torneos/persistence/prisma-store.ts.
--
-- ⚠️ POR QUÉ NO SE APLICA ACÁ (idéntico criterio que ProvisioningRun.sql):
--   Cambiar el schema de la DB de producción (Neon) es lo ÚNICO irreversible
--   (CLAUDE.md → Gate 2 / ADR-018). Este archivo vive FUERA de `prisma/migrations/` a
--   propósito: `prisma migrate deploy` NO lo ve. Aplicarlo es una decisión del dueño.
--
-- ⚠️ POR QUÉ NO ESTÁ EN schema.prisma:
--   Agregar el modelo sin aplicar la migración deja el cliente Prisma "schema-ahead" de
--   la DB (el footgun que tiró CH prod). La tabla se toca por $queryRaw hasta Gate 2;
--   recién al aplicar se promueve a modelo Prisma. Por eso `gate:rls` no cambia (esta tabla no cuenta hoy en la cobertura estática)
--   (esta tabla NO cuenta en la cobertura estática hoy) — la migración trae su RLS
--   EXPLÍCITA acá, no depende del loop data-driven de prisma/rls/0001.
--
-- CÓMO APLICARLO (cuando el dueño lo autorice — Gate 2):
--   1. psql "$DATABASE_URL" -f prisma/pending-gate2/Torneo.sql   (crea tabla + RLS)
--   2. Agregar el modelo `Torneo` a prisma/schema.prisma (snippet abajo) + prisma generate.
--   3. Reemplazar el $queryRaw de prisma-store.ts por `prisma.torneo` (opcional, cosmético).
--   4. Verificar aislamiento: la policy debe listar 1 fila para "Torneo" en pg_policies.
--
-- NOTA RLS (ADR-018): `Torneo` ES de-tenant (lleva `tenantId`), así que ENABLE RLS +
-- POLICY tenant_isolation, con el MISMO patrón que prisma/rls/0001_enable_rls.sql
-- (USING + WITH CHECK contra el GUC app.current_tenant_id). El enforcement real se da
-- cuando la app conecta como `app_rls` (sin BYPASSRLS); el owner queda exento salvo
-- FORCE (0003). `id` es un cuid GLOBAL (PK única global) → no colisiona entre tenants.

BEGIN;

CREATE TABLE IF NOT EXISTS "Torneo" (
  "id"        TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL,
  "snapshot"  JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Torneo_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Índice líder por tenantId (enciende con el predicado RLS; MT-5: RLS = aislamiento + perf).
CREATE INDEX IF NOT EXISTS "Torneo_tenantId_idx" ON "Torneo" ("tenantId");

-- RLS por tenant — mismo patrón data-driven que 0001_enable_rls.sql, acá EXPLÍCITO para
-- esta tabla (idempotente: DROP POLICY IF EXISTS + CREATE; ENABLE no falla si ya estaba).
ALTER TABLE "Torneo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Torneo";
CREATE POLICY tenant_isolation ON "Torneo"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

COMMIT;

-- ----------------------------------------------------------------------------
-- Snippet para prisma/schema.prisma (referencia — NO se agrega en esta iteración,
-- para no dejar el cliente schema-ahead de la DB):
--
-- model Torneo {
--   id        String   @id @default(cuid())
--   tenantId  String
--   tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
--   snapshot  Json     // snapshot completo = motor.serializar(torneo)
--   createdAt DateTime @default(now())
--   updatedAt DateTime @updatedAt
--
--   @@index([tenantId])
-- }
--
-- (Y agregar `torneos Torneo[]` en el modelo Tenant.)
-- Al agregarlo, `gate:rls` suma la tabla a la cobertura (N→N+1) (check-coverage lo cuenta como
-- protegible por tener tenantId) — coherente, no rompe la cobertura.
-- ----------------------------------------------------------------------------

-- Post-check (correr aparte para auditar; debe listar la policy de Torneo):
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'Torneo';
