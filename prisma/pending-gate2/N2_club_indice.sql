-- ============================================================================
-- N2_club_indice — ClubReservaIndice: proyección de lectura de las reservas del club
--                  (paso 6 de 7 del paquete Gate 2)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01) · ADR-018
-- ============================================================================
--
-- QUIÉN LA USA: B1 (motor en servidor: se reescribe por diff al guardar la foto del club,
-- desde cualquier canal) · B2 (disponibilidad pública del turnero, GET /turnos/disponibilidad)
-- · B8 (cron de recordatorios por WhatsApp: `recordadoEn`). Diseño: PLAN-REINGENIERIA-N2 §4.4
-- punto 3.
--
-- QUÉ ES: una PROYECCIÓN, no la verdad. La verdad sigue siendo la foto del club. Se puede
-- vaciar y reconstruir desde la foto en cualquier momento (droppable). Sin la tabla
-- (hayTabla("ClubReservaIndice") false) todo cae a leer la foto: más caro, funciona.
-- `reservaId` y `canchaId` son ids DENTRO de la foto → sin FK a propósito.
-- `clienteTelHash`: sha256 del teléfono normalizado (nunca el teléfono en claro: es índice
-- de búsqueda, no ficha del cliente).
--
-- ADITIVA (tabla nueva) · IDEMPOTENTE (IF NOT EXISTS + guardas DO) · una transacción.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS "ClubReservaIndice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "canchaId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL,
    "ref" TEXT,
    "senaEstado" TEXT,
    "clienteTelHash" TEXT,
    "recordadoEn" TIMESTAMP(3),
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubReservaIndice_pkey" PRIMARY KEY ("id")
);

-- Una fila por reserva del negocio: el diff hace UPSERT por esta clave (doble guardado = misma fila).
CREATE UNIQUE INDEX IF NOT EXISTS "ClubReservaIndice_tenantId_reservaId_key" ON "ClubReservaIndice"("tenantId", "reservaId");
CREATE INDEX IF NOT EXISTS "ClubReservaIndice_tenantId_idx" ON "ClubReservaIndice"("tenantId");
-- Disponibilidad: reservas de una cancha en una franja.
CREATE INDEX IF NOT EXISTS "ClubReservaIndice_tenantId_canchaId_inicio_idx" ON "ClubReservaIndice"("tenantId", "canchaId", "inicio");
-- Recordatorios: reservas que empiezan en la próxima ventana.
CREATE INDEX IF NOT EXISTS "ClubReservaIndice_tenantId_inicio_idx" ON "ClubReservaIndice"("tenantId", "inicio");

DO $$ BEGIN
  ALTER TABLE "ClubReservaIndice" ADD CONSTRAINT "ClubReservaIndice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS (misma policy que prisma/rls/0001_enable_rls.sql; el paso 7 la re-pone igual).
ALTER TABLE "ClubReservaIndice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ClubReservaIndice";
CREATE POLICY tenant_isolation ON "ClubReservaIndice"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA (sin pérdida: es una proyección; la verdad está en la foto del club).
--   BEGIN;
--   DROP TABLE IF EXISTS "ClubReservaIndice";
--   COMMIT;
-- Modelo para schema.prisma: bloque `// N2:` (N2_club_indice) de prisma/schema.prisma.
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
