-- ============================================================================
-- CadenaDeFrio — lecturas de temperatura de cámaras y exhibidoras (MAGRA · M10 · T5)
-- Gate 2 pendiente · NO aplicada (toca Neon prod → decisión del dueño)
-- ============================================================================
--
-- QUIÉN LA USA: la sección «Cadena de frío» de Lotes y vencimientos (/admin/lotes/frio):
-- la carnicería anota la temperatura de cada equipo y ve si quedó fuera de rango.
-- Antes vivía comentada en N2_retail.sql (bloque M10); se mueve acá en su tanda propia.
--
-- ADITIVA: una tabla NUEVA, no toca ninguna existente.
-- IDEMPOTENTE: CREATE TABLE/INDEX IF NOT EXISTS + FK con guarda DO/duplicate_object. Una transacción.
--
-- TOLERANCIA: el código pregunta antes por la tabla (migracionFrioAplicada,
-- src/lib/carniceria/schema-probe.ts). Sin la tabla, la pantalla dice «En preparación» y no
-- consulta RegistroFrio. NO está en schema.prisma: se accede por SQL crudo.
--
-- RLS: tiene `tenantId` → al aplicarla, RE-CORRER prisma/rls/0001_enable_rls.sql (le pone la
-- policy `tenant_isolation`, como al resto de las tablas de negocio).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "RegistroFrio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "equipo" TEXT NOT NULL,                  -- "cámara 1", "exhibidora"
    "temperaturaC" DECIMAL(5,2) NOT NULL,
    "medidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medidoPor" TEXT,                        -- "user:<id>", sin FK (como createdBy)
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RegistroFrio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RegistroFrio_tenantId_idx" ON "RegistroFrio"("tenantId");
CREATE INDEX IF NOT EXISTS "RegistroFrio_tenantId_equipo_medidoEn_idx" ON "RegistroFrio"("tenantId", "equipo", "medidoEn");

DO $$ BEGIN
  ALTER TABLE "RegistroFrio" ADD CONSTRAINT "RegistroFrio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- Después de aplicar: re-correr prisma/rls/0001_enable_rls.sql (RLS de RegistroFrio).

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK. ⚠️ Pierde todas las lecturas de temperatura cargadas: exportarlas antes si ya se usaron
-- (SELECT * FROM "RegistroFrio"). Después, reiniciar los procesos (el probe cachea por request).
--   BEGIN;
--   DROP TABLE IF EXISTS "RegistroFrio";
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
