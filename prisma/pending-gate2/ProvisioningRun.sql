-- ============================================================================
-- GATE 2 — MIGRACIÓN PREPARADA, **NO APLICADA** (ADR-074, "Próxima iteración")
-- ============================================================================
--
-- Persiste la SAGA de la fábrica de tenants (`ProvisioningRun`) para:
--   1. Idempotencia de la orquestación entre PROCESOS (hoy es in-memory, se pierde al reiniciar —
--      ver `src/lib/provisioning/runtime.ts` → `sharedIdempotencyStore`).
--   2. Reanudar una saga interrumpida (proceso muerto entre HOST_BOUND e INVITED).
--   3. Auditoría del alta a nivel plataforma (quién/qué/cuándo/estado), complementaria al AuditLog
--      colgado del tenant que ya escribe `commitTenantAction`.
--
-- ⚠️ POR QUÉ NO SE APLICA ACÁ: cambiar el schema de la DB de producción (Neon) es lo ÚNICO
-- irreversible (CLAUDE.md → Gate 2 / ADR-018). Este archivo vive FUERA de `prisma/migrations/`
-- a propósito: `prisma migrate deploy` NO lo ve. Aplicarlo es una decisión del dueño.
--
-- CÓMO APLICARLO (cuando el dueño lo autorice):
--   1. Agregar el modelo `ProvisioningRun` a `prisma/schema.prisma` (snippet abajo).
--   2. `npx prisma migrate dev --name provisioning_run` (genera la migración versionada real).
--   3. Reemplazar `sharedIdempotencyStore` (in-memory) por un `IdempotencyStore` sobre esta tabla.
--
-- NOTA RLS (ADR-018): `ProvisioningRun` es del CONTROL-PLANE (cross-tenant, como `Tenant`), NO lleva
-- policy de aislamiento por `tenantId` — sólo la toca `operatorPrisma`. `tenantId` es NULLABLE porque
-- la fila nace en PENDING, antes de que exista el tenant (se completa al llegar a DB_COMMITTED).

CREATE TABLE IF NOT EXISTS "ProvisioningRun" (
  "id"             TEXT PRIMARY KEY,
  "idempotencyKey" TEXT NOT NULL,
  "slug"           TEXT NOT NULL,
  "state"          TEXT NOT NULL DEFAULT 'PENDING',
  "tenantId"       TEXT,
  "plan"           JSONB,
  "outcome"        JSONB,
  "error"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProvisioningRun_idempotencyKey_key" ON "ProvisioningRun" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "ProvisioningRun_slug_idx" ON "ProvisioningRun" ("slug");
CREATE INDEX IF NOT EXISTS "ProvisioningRun_state_idx" ON "ProvisioningRun" ("state");

-- ----------------------------------------------------------------------------
-- Snippet para prisma/schema.prisma (referencia — NO se agrega en esta iteración):
--
-- enum ProvisioningState {
--   PENDING
--   DB_COMMITTED
--   HOST_BOUND
--   INVITED
--   ACTIVE
--   FAILED_COMPENSATED
-- }
--
-- model ProvisioningRun {
--   id             String            @id @default(cuid())
--   idempotencyKey String            @unique
--   slug           String
--   state          ProvisioningState @default(PENDING)
--   tenantId       String?           // se completa al llegar a DB_COMMITTED
--   plan           Json?
--   outcome        Json?
--   error          String?
--   createdAt      DateTime          @default(now())
--   updatedAt      DateTime          @updatedAt
--
--   @@index([slug])
--   @@index([state])
-- }
-- ----------------------------------------------------------------------------
