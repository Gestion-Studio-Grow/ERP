-- ============================================================================
-- CARNICERÍA — schema del rubro cárnico (categoría + costo + lotes/vacío + despiece)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → OK del dueño) · ADR-018
-- ============================================================================
--
-- Spec y racional: docs/preventa/magra/backoffice-carniceria-spec.md
--
-- ⚠️ POR QUÉ NO SE APLICA ACÁ y NO ESTÁ EN schema.prisma (igual que ProvisioningRun.sql):
-- `main` auto-deploya a prod. Si estas columnas/tablas estuvieran en schema.prisma, el
-- cliente Prisma las SELECCIONARÍA en cada query de Product → CRASH en prod hasta migrar
-- (fue el incidente CH del schema-ahead). Por eso: el código las accede por SQL CRUDO con
-- degradación (src/lib/carniceria/*), gateado por `hasCarniceriaSchema()`; sin las tablas,
-- las pantallas nuevas muestran "En preparación" y NADA rompe. Cuando el dueño autorice,
-- se aplica esta migración (crea tablas + RLS), y recién ahí las pantallas se encienden.
--
-- IDEMPOTENTE (IF NOT EXISTS + guardas DO): segura de re-correr; la usa también la demo
-- local (npm run demo) sobre PGlite para renderizar las pantallas nuevas sin tocar Neon.
--
-- ADITIVA y no invasiva: agrega 2 columnas NULLABLE a Product (no rompe filas vivas) y CREA
-- 3 tablas + 2 enums. NO toca ninguna columna existente ni ningún otro modelo. Verificación
-- offline: aplicar en PGlite (demo) + tsc + npm test. SCHEMA COMPARTIDO → revisión del PMO
-- antes de main y antes de `prisma migrate deploy` (Gate 2).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1 + §2 · Product: categoría de góndola + costo de referencia (ambas NULLABLE)
-- ─────────────────────────────────────────────────────────────────────────────
-- `category`: góndola del corte (vaca/cerdo/pollo/achuras/preparados/gourmet/otros). Hoy se
--   DERIVA del nombre (src/lib/carniceria/cortes.classifyCorte); con esta columna pasa a ser
--   explícita y editable, y el clasificador queda como fallback/sugerencia. String (no enum)
--   para no acoplar el schema a una taxonomía cerrada: otros rubros retail traen otras góndolas.
-- `cost`: costo de referencia por unidad de venta ($/kg o $/u). Independiza el margen del
--   último costo de compra (que puede faltar). El margen usa cost si está, si no el último
--   StockPurchaseItem.unitCost (mismo criterio que hoy).
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "cost" DOUBLE PRECISION;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3 · Lotes / envasado al vacío (trazabilidad + cadena de frío + PESO VARIABLE)
-- ─────────────────────────────────────────────────────────────────────────────
-- Un `ProductBatch` es un LOTE de envasado al vacío de un corte: su fecha de envasado, su
-- vencimiento, y —clave para carne— su PESO REAL (`netWeightKg`), porque un paquete al vacío
-- nunca pesa exacto (peso variable por paquete). `packages` = cuántos paquetes tiene el lote.
-- `supplierId`/`unitCost` dan trazabilidad al proveedor y costeo por lote. `status` sigue el
-- ciclo de vida (disponible → agotado/vencido/retirado). Con esto una venta puede referenciar
-- el lote (FEFO: primero el que vence antes) y el negocio tiene trazabilidad real del vacío.
DO $$ BEGIN
  CREATE TYPE "BatchStatus" AS ENUM ('AVAILABLE', 'DEPLETED', 'EXPIRED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProductBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT,
    "supplierId" TEXT,
    "code" TEXT NOT NULL,                                  -- nº de lote (correlativo o del proveedor)
    "packedAt" TIMESTAMP(3),                               -- fecha de envasado al vacío
    "expiresAt" TIMESTAMP(3),                              -- vencimiento
    "netWeightKg" DOUBLE PRECISION,                        -- peso neto real del lote (peso variable)
    "packages" INTEGER NOT NULL DEFAULT 1,                 -- cantidad de paquetes al vacío del lote
    "unitCost" DOUBLE PRECISION,                           -- costo $/kg del lote (trazabilidad de costo)
    "status" "BatchStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductBatch_tenantId_idx" ON "ProductBatch"("tenantId");
CREATE INDEX IF NOT EXISTS "ProductBatch_tenantId_productId_idx" ON "ProductBatch"("tenantId", "productId");
-- FEFO / vencimientos: ordenar por vencimiento dentro del tenant.
CREATE INDEX IF NOT EXISTS "ProductBatch_tenantId_expiresAt_idx" ON "ProductBatch"("tenantId", "expiresAt");
-- nº de lote único por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductBatch_tenantId_code_key" ON "ProductBatch"("tenantId", "code");

DO $$ BEGIN
  ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4 · Despiece / rendimiento (donde se gana o se pierde plata en carnicería)
-- ─────────────────────────────────────────────────────────────────────────────
-- Un `ProcessingRun` es un DESPIECE: entra una media res (o cuarto/pieza) con su peso y costo,
-- y salen N cortes (`ProcessingOutput`) con el peso obtenido de cada uno. El RENDIMIENTO por
-- corte = pesoCorte / pesoEntrada; la MERMA = pesoEntrada − Σ pesosCortes (grasa/hueso/pérdida).
-- Con esto el dueño ve el rendimiento real de cada media res y el costo REAL por corte (prorratea
-- el costo de entrada por el rendimiento), no un costo inventado. Cada output puede generar el
-- lote (`ProductBatch`) correspondiente y sumar stock del corte.
DO $$ BEGIN
  CREATE TYPE "ProcessingStatus" AS ENUM ('DRAFT', 'DONE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProcessingRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" INTEGER NOT NULL,                               -- correlativo por tenant
    "supplierId" TEXT,
    "inputName" TEXT NOT NULL,                             -- ej "Media res novillo"
    "inputWeightKg" DOUBLE PRECISION NOT NULL,             -- peso de entrada
    "inputCost" DOUBLE PRECISION NOT NULL DEFAULT 0,       -- costo total de la pieza de entrada
    "status" "ProcessingStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProcessingRun_tenantId_idx" ON "ProcessingRun"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProcessingRun_tenantId_code_key" ON "ProcessingRun"("tenantId", "code");

DO $$ BEGIN
  ALTER TABLE "ProcessingRun" ADD CONSTRAINT "ProcessingRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessingRun" ADD CONSTRAINT "ProcessingRun_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProcessingOutput" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,                                  -- snapshot del corte obtenido
    "weightKg" DOUBLE PRECISION NOT NULL,                  -- kilos obtenidos de este corte
    "batchId" TEXT,                                        -- lote generado (opcional)

    CONSTRAINT "ProcessingOutput_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProcessingOutput_tenantId_idx" ON "ProcessingOutput"("tenantId");
CREATE INDEX IF NOT EXISTS "ProcessingOutput_runId_idx" ON "ProcessingOutput"("runId");

DO $$ BEGIN
  ALTER TABLE "ProcessingOutput" ADD CONSTRAINT "ProcessingOutput_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessingOutput" ADD CONSTRAINT "ProcessingOutput_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProcessingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessingOutput" ADD CONSTRAINT "ProcessingOutput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProcessingOutput" ADD CONSTRAINT "ProcessingOutput_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §5 · RLS — las 3 tablas son DE-TENANT → policy de aislamiento (REQUISITO, ADR-018)
-- ─────────────────────────────────────────────────────────────────────────────
-- MISMA policy `tenant_isolation` que prisma/rls/0001_enable_rls.sql (data-driven): filtra por
-- el GUC `app.current_tenant_id` que setea `tenantTransaction` por request (src/lib/rls.ts).
-- Se emite ACÁ, explícita, para que aplicar esta migración PROTEJA las tablas en el mismo acto
-- (no depender de re-correr 0001). Idempotente (DROP POLICY IF EXISTS + CREATE). Fail-closed:
-- sin contexto de tenant no se ve ni se escribe nada. NO se aplica al owner (neondb_owner) salvo
-- FORCE RLS — igual criterio que 0001; el enforcement real lo da conectar como `app_rls`.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ProductBatch','ProcessingRun','ProcessingOutput']
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
-- CÓMO APLICARLO (cuando el dueño autorice — Gate 2, flujo seguro):
--   1. Pre-chequeo: aplicar en una Neon dev branch (o PGlite) + tsc + npm test verdes.
--   2. Aplicar a prod (una vez): correr este archivo contra Neon (psql / migrate) O moverlo a
--      prisma/migrations/<ts>_carniceria_rubro/migration.sql y `prisma migrate deploy`.
--   3. (Opcional, para type-safety) agregar los modelos a schema.prisma y `prisma migrate dev`
--      — recién CUANDO la tabla ya exista en prod, para no reintroducir schema-ahead.
--   4. Verificar RLS: prisma/rls/check-coverage.mjs (estático) + check-rls-live.mjs (en vivo)
--      deben listar `tenant_isolation` en ProductBatch/ProcessingRun/ProcessingOutput.
-- El código ya tolera la ausencia (hasCarniceriaSchema()=false → "En preparación"), así que
-- se puede mergear ANTES de aplicar sin romper prod; las pantallas se encienden al migrar.
--
-- ROLLBACK (orden inverso):
--   DROP TABLE IF EXISTS "ProcessingOutput";
--   DROP TABLE IF EXISTS "ProcessingRun";
--   DROP TYPE IF EXISTS "ProcessingStatus";
--   DROP TABLE IF EXISTS "ProductBatch";
--   DROP TYPE IF EXISTS "BatchStatus";
--   ALTER TABLE "Product" DROP COLUMN IF EXISTS "cost";
--   ALTER TABLE "Product" DROP COLUMN IF EXISTS "category";
--
-- SNIPPET para schema.prisma (referencia — NO se agrega hasta que la tabla exista en prod):
--   model ProductBatch {
--     id String @id @default(cuid())
--     tenant Tenant @relation(fields: [tenantId], references: [id])
--     tenantId String
--     productId String?
--     supplierId String?
--     code String
--     packedAt DateTime?
--     expiresAt DateTime?
--     netWeightKg Float?
--     packages Int @default(1)
--     unitCost Float?
--     status BatchStatus @default(AVAILABLE)
--     note String?
--     createdBy String
--     createdAt DateTime @default(now())
--     updatedAt DateTime @updatedAt
--     @@unique([tenantId, code])
--     @@index([tenantId]) @@index([tenantId, productId]) @@index([tenantId, expiresAt])
--   }
--   enum BatchStatus { AVAILABLE DEPLETED EXPIRED WITHDRAWN }
--   model ProcessingRun {
--     id String @id @default(cuid())
--     tenant Tenant @relation(fields: [tenantId], references: [id])
--     tenantId String
--     code Int
--     supplierId String?
--     inputName String
--     inputWeightKg Float
--     inputCost Float @default(0)
--     status ProcessingStatus @default(DRAFT)
--     note String?
--     createdBy String
--     createdAt DateTime @default(now())
--     updatedAt DateTime @updatedAt
--     outputs ProcessingOutput[]
--     @@unique([tenantId, code]) @@index([tenantId])
--   }
--   enum ProcessingStatus { DRAFT DONE CANCELLED }
--   model ProcessingOutput {
--     id String @id @default(cuid())
--     tenant Tenant @relation(fields: [tenantId], references: [id])
--     tenantId String
--     run ProcessingRun @relation(fields: [runId], references: [id], onDelete: Cascade)
--     runId String
--     productId String?
--     name String
--     weightKg Float
--     batchId String?
--     @@index([tenantId]) @@index([runId])
--   }
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
