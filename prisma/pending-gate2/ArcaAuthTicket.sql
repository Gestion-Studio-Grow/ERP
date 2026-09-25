-- ============================================================================
-- PROMOVIDA — ya NO está pendiente: la crea prisma/migrations/20260925120000_lanzamiento_base
-- (R0-F1), con la misma forma, sus índices, su llave foránea y RLS (política tenant_isolation).
-- ============================================================================
--
-- Este archivo queda sólo por compatibilidad con lo que todavía lo corre después de las
-- migraciones (scripts/qa/arca-emision-e2e.mjs). Es IDEMPOTENTE: sobre una base con la
-- migración aplicada no cambia nada. No aplicarlo a mano en ningún lado: la tabla viaja con
-- `prisma migrate deploy` (en Neon, sólo con autorización del dueño).
--
-- Qué es (sin cambios): la caché PERSISTENTE y CIFRADA del Ticket de Acceso (TA) de ARCA POR
-- CERTIFICADO (huella SHA-256), no por negocio. WSAA rechaza un segundo login mientras haya un
-- TA vigente (`coe.alreadyAuthenticated`, ~10-15 min de bloqueo); en serverless cada corrida del
-- worker es un proceso nuevo. `token`+`sign` van sellados (FISCAL_MASTER_KEY, ADR-066);
-- `expiration` en claro. `tenantId` = quién lo pidió último (RLS y rastro). La usa
-- src/lib/fiscal/arca-ta-store.ts con SQL crudo y `operatorPrisma`: si la tabla no existe,
-- degrada a no-op. En schema.prisma: modelo `ArcaAuthTicket`.

CREATE TABLE IF NOT EXISTS "ArcaAuthTicket" (
  "id"         TEXT PRIMARY KEY,
  -- Huella SHA-256 (hex) del certificado con que se pidió el TA. Es la CLAVE (con `service`).
  "certHuella" TEXT NOT NULL,
  "service"    TEXT NOT NULL DEFAULT 'wsfe',
  -- El negocio que lo pidió por última vez. NO es la clave: le da la policy de RLS.
  "tenantId"   TEXT NOT NULL,
  -- Material CIFRADO (envelope). Ilegible sin FISCAL_MASTER_KEY.
  "kekId"      TEXT NOT NULL,
  "wrappedDek" TEXT NOT NULL,
  "sealed"     TEXT NOT NULL, -- {token,sign} cifrados con la DEK — base64("iv.tag.ciphertext")
  -- Vencimiento del TA (ISO-8601 tal como lo devuelve WSAA). EN CLARO: no es secreto y
  -- permite descartar un TA vencido sin descifrar.
  "expiration" TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Un TA por certificado y servicio: es el árbitro del upsert
-- `ON CONFLICT ("certHuella", "service")` del store.
CREATE UNIQUE INDEX IF NOT EXISTS "ArcaAuthTicket_certHuella_service_key" ON "ArcaAuthTicket" ("certHuella", "service");
CREATE INDEX IF NOT EXISTS "ArcaAuthTicket_tenantId_idx" ON "ArcaAuthTicket" ("tenantId");

-- FK a Tenant: si se borra el negocio que lo pidió último, se va el TA cacheado (el próximo
-- negocio con ese certificado vuelve a loguearse cuando venza el vigente).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ArcaAuthTicket_tenantId_fkey') THEN
    ALTER TABLE "ArcaAuthTicket"
      ADD CONSTRAINT "ArcaAuthTicket_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
