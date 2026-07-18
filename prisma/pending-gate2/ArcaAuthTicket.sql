-- ============================================================================
-- GATE 2 — MIGRACIÓN PREPARADA, **NO APLICADA** (ADR-022 §6 · ADR-066)
-- ============================================================================
--
-- Caché PERSISTENTE del Ticket de Acceso (TA) de ARCA por tenant, CIFRADA.
--
-- POR QUÉ: WSAA rechaza un segundo login mientras haya un TA vigente
-- (`coe.alreadyAuthenticated`), y el bloqueo dura ~10-15 min. En serverless (Vercel)
-- cada corrida del worker de emisión (`processArcaOutbox`) es un proceso nuevo: sin
-- persistir el TA, la 2ª emisión dentro de la ventana del TA re-loguea y falla. Esta
-- tabla guarda el TA para reusarlo entre invocaciones y cerrar el ciclo de emisión.
--
-- 🔒 CIFRADO: `token`+`sign` (un bearer de ~12h) se guardan CIFRADOS con el mismo
-- envelope (DEK/KEK, `FISCAL_MASTER_KEY`) que el certificado (ADR-066) — nunca en
-- claro. `expiration` va en claro (es un timestamp, no un secreto): permite descartar
-- un TA vencido SIN descifrar.
--
-- ⚠️ POR QUÉ NO SE APLICA ACÁ: cambiar el schema de la DB de producción (Neon) es lo
-- ÚNICO irreversible (CLAUDE.md → Gate 2 / ADR-018). Este archivo vive FUERA de
-- `prisma/migrations/` a propósito: `prisma migrate deploy` NO lo ve. Aplicarlo es
-- decisión del dueño.
--
-- DEGRADACIÓN SEGURA MIENTRAS NO SE APLIQUE: el store (`src/lib/fiscal/arca-ta-store.ts`)
-- accede a esta tabla con SQL crudo DEFENSIVO y detecta si existe (`to_regclass`). Si NO
-- existe, DEGRADA a no-op (no cachea el TA) en vez de tumbar la emisión con un 42P01 — la
-- emisión sigue funcionando, a lo sumo re-loguea. Por eso `ArcaAuthTicket` NO está en
-- `schema.prisma` (evita el footgun schema-ahead: leer una tabla/columna sin aplicar
-- rompe queries en prod).
--
-- ⚠️ RLS (ADR-018): `ArcaAuthTicket` tiene `tenantId` → re-ejecutar
--    `prisma/rls/0001_enable_rls.sql` (data-driven) tras esta migración, en el mismo
--    deploy, para que la policy `tenant_isolation` la aísle. (El material igual solo se
--    lee/escribe por `operatorPrisma`, plano de operador; RLS es defensa extra.)
--
-- CÓMO APLICARLO (cuando el dueño lo autorice):
--   1. Correr este `CREATE TABLE` contra Neon (psql / migración versionada).
--   2. Re-ejecutar `prisma/rls/0001_enable_rls.sql` (le pone la policy por tener `tenantId`).
--   3. (Opcional) sumar el modelo a `schema.prisma` si se quiere acceso tipado — hoy se
--      accede por SQL crudo defensivo, así que NO es necesario para que funcione.

CREATE TABLE IF NOT EXISTS "ArcaAuthTicket" (
  "id"         TEXT PRIMARY KEY,
  "tenantId"   TEXT NOT NULL,
  "service"    TEXT NOT NULL DEFAULT 'wsfe',
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

-- Un TA por tenant (el `service` es 'wsfe' por ahora; el UNIQUE es por tenant para que el
-- upsert `ON CONFLICT ("tenantId")` del store funcione).
CREATE UNIQUE INDEX IF NOT EXISTS "ArcaAuthTicket_tenantId_key" ON "ArcaAuthTicket" ("tenantId");

-- FK a Tenant: si se borra el tenant, se va su TA cacheado.
ALTER TABLE "ArcaAuthTicket"
  ADD CONSTRAINT "ArcaAuthTicket_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Snippet para prisma/schema.prisma (referencia — NO se agrega en esta iteración;
-- el acceso es por SQL crudo defensivo para no romper prod schema-ahead):
--
-- model ArcaAuthTicket {
--   id         String   @id @default(cuid())
--   tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
--   tenantId   String   @unique
--   service    String   @default("wsfe")
--   kekId      String
--   wrappedDek String
--   sealed     String
--   expiration String
--   createdAt  DateTime @default(now())
--   updatedAt  DateTime @updatedAt
-- }
-- ----------------------------------------------------------------------------
