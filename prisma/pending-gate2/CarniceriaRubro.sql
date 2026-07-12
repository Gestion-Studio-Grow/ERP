-- ============================================================================
-- CARNICERÍA — schema del rubro cárnico (categoría + costo + lotes/vacío + despiece)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → OK del dueño) · ADR-018
-- ============================================================================
--
-- Spec y racional: docs/preventa/magra/backoffice-carniceria-spec.md
--
-- Escrita a mano mirroreando el patrón de add_stock_ledger / add_stock_purchases.
-- ADITIVA y no invasiva: agrega 2 columnas NULLABLE a Product (no rompe filas vivas) y
-- CREA 3 tablas nuevas + 2 enums. NO toca ninguna columna existente ni ningún otro modelo.
-- Verificación offline recomendada antes de integrar: prisma validate + prisma generate +
-- tsc del slice + npm test. SCHEMA COMPARTIDO → revisión del PMO antes de main y antes de
-- `prisma migrate deploy` (Gate 2).
--
-- ⚠️ RLS: ProductBatch, ProcessingRun y ProcessingOutput son tablas DE-TENANT → al aplicar
-- esta migración hay que sumar sus políticas RLS en prisma/rls/ (no van en migrations/) y
-- actualizar el conteo de cobertura de `gate:rls`. Ver la spec §6.

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
ALTER TABLE "Product" ADD COLUMN "category" TEXT;
ALTER TABLE "Product" ADD COLUMN "cost" DOUBLE PRECISION;

-- ─────────────────────────────────────────────────────────────────────────────
-- §3 · Lotes / envasado al vacío (trazabilidad + cadena de frío + PESO VARIABLE)
-- ─────────────────────────────────────────────────────────────────────────────
-- Un `ProductBatch` es un LOTE de envasado al vacío de un corte: su fecha de envasado, su
-- vencimiento, y —clave para carne— su PESO REAL (`netWeightKg`), porque un paquete al vacío
-- nunca pesa exacto (peso variable por paquete). `packages` = cuántos paquetes tiene el lote.
-- `supplierId`/`unitCost` dan trazabilidad al proveedor y costeo por lote. `status` sigue el
-- ciclo de vida (disponible → agotado/vencido/retirado). Con esto una venta puede referenciar
-- el lote (FEFO: primero el que vence antes) y el negocio tiene trazabilidad real del vacío.
CREATE TYPE "BatchStatus" AS ENUM ('AVAILABLE', 'DEPLETED', 'EXPIRED', 'WITHDRAWN');

CREATE TABLE "ProductBatch" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductBatch_tenantId_idx" ON "ProductBatch"("tenantId");
CREATE INDEX "ProductBatch_tenantId_productId_idx" ON "ProductBatch"("tenantId", "productId");
-- FEFO / vencimientos: ordenar por vencimiento dentro del tenant.
CREATE INDEX "ProductBatch_tenantId_expiresAt_idx" ON "ProductBatch"("tenantId", "expiresAt");
-- nº de lote único por tenant.
CREATE UNIQUE INDEX "ProductBatch_tenantId_code_key" ON "ProductBatch"("tenantId", "code");

ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- §4 · Despiece / rendimiento (donde se gana o se pierde plata en carnicería)
-- ─────────────────────────────────────────────────────────────────────────────
-- Un `ProcessingRun` es un DESPIECE: entra una media res (o cuarto/pieza) con su peso y costo,
-- y salen N cortes (`ProcessingOutput`) con el peso obtenido de cada uno. El RENDIMIENTO por
-- corte = pesoCorte / pesoEntrada; la MERMA = pesoEntrada − Σ pesosCortes (grasa/hueso/pérdida).
-- Con esto el dueño ve el rendimiento real de cada media res y el costo REAL por corte (prorratea
-- el costo de entrada por el rendimiento), no un costo inventado. Cada output puede generar el
-- lote (`ProductBatch`) correspondiente y sumar stock del corte.
CREATE TYPE "ProcessingStatus" AS ENUM ('DRAFT', 'DONE', 'CANCELLED');

CREATE TABLE "ProcessingRun" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProcessingRun_tenantId_idx" ON "ProcessingRun"("tenantId");
CREATE UNIQUE INDEX "ProcessingRun_tenantId_code_key" ON "ProcessingRun"("tenantId", "code");

ALTER TABLE "ProcessingRun" ADD CONSTRAINT "ProcessingRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessingRun" ADD CONSTRAINT "ProcessingRun_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProcessingOutput" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,                                  -- snapshot del corte obtenido
    "weightKg" DOUBLE PRECISION NOT NULL,                  -- kilos obtenidos de este corte
    "batchId" TEXT,                                        -- lote generado (opcional)

    CONSTRAINT "ProcessingOutput_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProcessingOutput_tenantId_idx" ON "ProcessingOutput"("tenantId");
CREATE INDEX "ProcessingOutput_runId_idx" ON "ProcessingOutput"("runId");

ALTER TABLE "ProcessingOutput" ADD CONSTRAINT "ProcessingOutput_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcessingOutput" ADD CONSTRAINT "ProcessingOutput_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProcessingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcessingOutput" ADD CONSTRAINT "ProcessingOutput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcessingOutput" ADD CONSTRAINT "ProcessingOutput_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (si hiciera falta revertir; ejecutar en orden inverso):
--   DROP TABLE "ProcessingOutput";
--   DROP TABLE "ProcessingRun";
--   DROP TYPE "ProcessingStatus";
--   DROP TABLE "ProductBatch";
--   DROP TYPE "BatchStatus";
--   ALTER TABLE "Product" DROP COLUMN "cost";
--   ALTER TABLE "Product" DROP COLUMN "category";
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
