-- RENDÍ (MIA Producciones, plan docs/tenants/mia-producciones/PLAN-RENDI.md §3 y §4). ADITIVA y SIN APLICAR en Neon
-- (Gate 2): tres tablas nuevas con RLS, columnas nullable en "CashMovement" y "ProyectoLiquidacion", nada se borra ni
-- se reescribe. Los demás negocios no la usan: las columnas quedan nulas y las tablas vacías.
-- - "ProyectoRendicion": la rendición de un gasto. Un gasto, una rendición (tenantId, gastoId) y un extra por gasto
--   por liquidación (tenantId, liquidacionId, gastoId). Plata en centavos enteros.
-- - "ProyectoAnticipo": plata adelantada; su egreso es "CashMovement"."proyectoAnticipoId" (un asiento por tipo).
-- - "ProyectoLiquidacion".pagadaEl/pagadaPor (estado PAGADA); su egreso es "CashMovement"."proyectoLiquidacionId".
-- - "ProyectoPinIngreso": el PIN de ingreso, un código vivo por usuario; fallosEl (ventana deslizante)/bloqueadoHasta
--   NO se reinician al pedir otro código.

ALTER TABLE "CashMovement" ADD COLUMN     "proyectoAnticipoId" TEXT,
ADD COLUMN     "proyectoLiquidacionId" TEXT;

ALTER TABLE "ProyectoLiquidacion" ADD COLUMN     "pagadaEl" TIMESTAMP(3),
ADD COLUMN     "pagadaPor" TEXT;

CREATE TABLE "ProyectoRendicion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "gastoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "medio" TEXT NOT NULL,
    "anticipoId" TEXT,
    "montoCentavos" INTEGER NOT NULL,
    "archivoId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "eventos" JSONB NOT NULL DEFAULT '[]',
    "aprobadoPor" TEXT,
    "aprobadoEl" TIMESTAMP(3),
    "liquidacionId" TEXT,
    "reintegradoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoRendicion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProyectoAnticipo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "proyectoId" TEXT,
    "montoCentavos" INTEGER NOT NULL,
    "entregadoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devueltoCentavos" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'ENTREGADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoAnticipo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProyectoPinIngreso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "venceEl" TIMESTAMP(3) NOT NULL,
    "usadoEl" TIMESTAMP(3),
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "fallosEl" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "bloqueadoHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoPinIngreso_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProyectoRendicion_tenantId_proyectoId_idx" ON "ProyectoRendicion"("tenantId", "proyectoId");

CREATE INDEX "ProyectoRendicion_tenantId_personaId_estado_idx" ON "ProyectoRendicion"("tenantId", "personaId", "estado");

CREATE UNIQUE INDEX "ProyectoRendicion_tenantId_gastoId_key" ON "ProyectoRendicion"("tenantId", "gastoId");

CREATE UNIQUE INDEX "ProyectoRendicion_tenantId_liquidacionId_gastoId_key" ON "ProyectoRendicion"("tenantId", "liquidacionId", "gastoId");

CREATE INDEX "ProyectoAnticipo_tenantId_personaId_idx" ON "ProyectoAnticipo"("tenantId", "personaId");

CREATE UNIQUE INDEX "ProyectoPinIngreso_tenantId_userId_key" ON "ProyectoPinIngreso"("tenantId", "userId");

CREATE UNIQUE INDEX "CashMovement_tenantId_proyectoLiquidacionId_type_key" ON "CashMovement"("tenantId", "proyectoLiquidacionId", "type");

CREATE UNIQUE INDEX "CashMovement_tenantId_proyectoAnticipoId_type_key" ON "CashMovement"("tenantId", "proyectoAnticipoId", "type");

ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoLiquidacionId_fkey" FOREIGN KEY ("proyectoLiquidacionId") REFERENCES "ProyectoLiquidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoAnticipoId_fkey" FOREIGN KEY ("proyectoAnticipoId") REFERENCES "ProyectoAnticipo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "ProyectoGasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ProyectoPersona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_anticipoId_fkey" FOREIGN KEY ("anticipoId") REFERENCES "ProyectoAnticipo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_archivoId_fkey" FOREIGN KEY ("archivoId") REFERENCES "ProyectoArchivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "ProyectoLiquidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProyectoAnticipo" ADD CONSTRAINT "ProyectoAnticipo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoAnticipo" ADD CONSTRAINT "ProyectoAnticipo_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ProyectoPersona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoAnticipo" ADD CONSTRAINT "ProyectoAnticipo_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProyectoPinIngreso" ADD CONSTRAINT "ProyectoPinIngreso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Guardas de plata a nivel base (Prisma no las modela; no las toca).
ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_montoCentavos_check" CHECK ("montoCentavos" > 0);
ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_medio_check"
  CHECK (("medio" = 'PROPIO' AND "anticipoId" IS NULL) OR ("medio" = 'ANTICIPO'));
ALTER TABLE "ProyectoAnticipo" ADD CONSTRAINT "ProyectoAnticipo_montos_check"
  CHECK ("montoCentavos" > 0 AND "devueltoCentavos" >= 0 AND "devueltoCentavos" <= "montoCentavos");

ALTER TABLE "ProyectoRendicion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoRendicion";
CREATE POLICY tenant_isolation ON "ProyectoRendicion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoAnticipo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoAnticipo";
CREATE POLICY tenant_isolation ON "ProyectoAnticipo"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoPinIngreso" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoPinIngreso";
CREATE POLICY tenant_isolation ON "ProyectoPinIngreso"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
