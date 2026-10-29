-- ============================================================================
-- N2_retail — fiado con límite y transferencia verificada (MAGRA) (paso 5 de 7)
-- PREPARADA, NO APLICADA · Gate 2 (toca Neon prod → decisión del dueño, D-01)
-- ============================================================================
--
-- QUIÉN LA USA: M7 (Client.limiteCredito: «queda a cobrar» por encima del límite frena con
-- «pedile al encargado») · M2 (Order.cobroVerificadoEn/Por: la transferencia del pedido con
-- delivery queda «a verificar» hasta que alguien la ve en la cuenta) · M10 (RegistroFrio,
-- CONDICIONAL: queda comentada hasta la respuesta M-8 de §7.1 del plan).
--
-- ADITIVA: 3 columnas NULLABLE en tablas vivas (Client, Order), sin DEFAULT → Postgres no
-- reescribe la tabla y las filas existentes quedan en NULL (= sin límite / sin verificar).
-- No toca ninguna columna existente. Sin tablas nuevas activas → sin RLS nueva acá (Client y
-- Order ya tienen su policy por 0001).
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS. Una transacción.
--
-- TOLERANCIA: hayColumna("Client","limiteCredito") false → M7 guarda el límite en el JSON de
-- la ficha; hayColumna("Order","cobroVerificadoEn") false → M2 marca en AuditLog + JSON del
-- pedido (criterios M7-C1 y M2-C4).
-- ============================================================================

BEGIN;

-- Límite de fiado del cliente, en pesos. NULL = sin límite (como hoy). Plata → Decimal(14,2).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "limiteCredito" DECIMAL(14,2);

-- Transferencia vista en la cuenta: cuándo y quién (id del User; texto como `createdBy`, sin
-- FK para no atar el borrado de usuarios a los pedidos históricos).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cobroVerificadoEn" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cobroVerificadoPor" TEXT;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONDICIONAL M10 · RegistroFrio (cadena de frío) — COMENTADA hasta la respuesta M-8 (§7.1).
-- Si el cliente dice que sí, se descomenta en una tanda propia (M10), se suma a este paquete
-- o al siguiente y se re-corre el paso 7 (0001) para su RLS. Sin descomentar no existe.
--
-- CREATE TABLE IF NOT EXISTS "RegistroFrio" (
--     "id" TEXT NOT NULL,
--     "tenantId" TEXT NOT NULL,
--     "equipo" TEXT NOT NULL,                  -- "cámara 1", "exhibidora"
--     "temperaturaC" DECIMAL(5,2) NOT NULL,
--     "medidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     "medidoPor" TEXT,
--     "nota" TEXT,
--     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     CONSTRAINT "RegistroFrio_pkey" PRIMARY KEY ("id")
-- );
-- CREATE INDEX IF NOT EXISTS "RegistroFrio_tenantId_idx" ON "RegistroFrio"("tenantId");
-- CREATE INDEX IF NOT EXISTS "RegistroFrio_tenantId_equipo_medidoEn_idx" ON "RegistroFrio"("tenantId", "equipo", "medidoEn");
-- DO $$ BEGIN
--   ALTER TABLE "RegistroFrio" ADD CONSTRAINT "RegistroFrio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- (RLS: la pone el paso 7, re-ejecución de prisma/rls/0001_enable_rls.sql.)
-- Reversa: DROP TABLE IF EXISTS "RegistroFrio";
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- REVERSA. ⚠️ Pierde los límites cargados y las verificaciones de transferencia: exportarlas
-- antes si ya se usaron (SELECT id, "limiteCredito" FROM "Client" WHERE "limiteCredito" IS NOT NULL).
--   BEGIN;
--   ALTER TABLE "Order"  DROP COLUMN IF EXISTS "cobroVerificadoPor";
--   ALTER TABLE "Order"  DROP COLUMN IF EXISTS "cobroVerificadoEn";
--   ALTER TABLE "Client" DROP COLUMN IF EXISTS "limiteCredito";
--   COMMIT;
-- Campos para schema.prisma: líneas `// N2:` (N2_retail) en los modelos Client y Order.
-- ─────────────────────────────────────────────────────────────────────────────

-- — Elaborado por GSG
