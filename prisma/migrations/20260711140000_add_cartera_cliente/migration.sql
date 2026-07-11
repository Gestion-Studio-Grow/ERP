-- Módulo CARTERA (producto Contador — ADR-025 §12, diseño validado ADR-045) — la ASIGNACIÓN
-- explícita estudio contable → cliente administrado (patrón variante, ADR-055). Cada cliente
-- del contador ES un Tenant; el estudio TAMBIÉN. Esta tabla relaciona ambos con estado y alias.
--
-- TODO ADITIVO: 1 enum nuevo + 1 tabla nueva. No toca ninguna tabla/fila viva. Verificada
-- local (validate + generate + tsc + tests); NO aplicada a Neon (Gate 2).
--
-- ⚠️ RLS — decisión deliberada: la columna del ESTUDIO se llama `tenantId` (el estudio es el
--    dueño de la fila) para que la policy data-driven de `prisma/rls/0001_enable_rls.sql`
--    (toda tabla de `public` con columna `tenantId`) la cubra SOLA, sin caso especial:
--    con el GUC del estudio se ven solo sus filas; un cliente jamás ve la cartera de nadie.
--    → Re-ejecutar `prisma/rls/0001_enable_rls.sql` tras esta migración, en el mismo deploy.

-- CreateEnum
CREATE TYPE "EstadoCarteraCliente" AS ENUM ('activa', 'pausada', 'baja');

-- CreateTable
CREATE TABLE "CarteraCliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteTenantId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "estado" "EstadoCarteraCliente" NOT NULL DEFAULT 'activa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarteraCliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarteraCliente_tenantId_idx" ON "CarteraCliente"("tenantId");

-- CreateIndex
CREATE INDEX "CarteraCliente_clienteTenantId_idx" ON "CarteraCliente"("clienteTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CarteraCliente_tenantId_clienteTenantId_key" ON "CarteraCliente"("tenantId", "clienteTenantId");

-- AddForeignKey
ALTER TABLE "CarteraCliente" ADD CONSTRAINT "CarteraCliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarteraCliente" ADD CONSTRAINT "CarteraCliente_clienteTenantId_fkey" FOREIGN KEY ("clienteTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
