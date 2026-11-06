-- RENDÍ (MIA Producciones, plan docs/tenants/mia-producciones/PLAN-RENDI.md §3 y §4). ADITIVA y SIN APLICAR en Neon
-- (Gate 2): tres tablas nuevas con RLS, columnas nullable en "CashMovement" y "ProyectoLiquidacion", índices únicos
-- nuevos (id, tenantId) en tablas existentes; nada se borra ni se reescribe. Los demás negocios no la usan.
-- - "ProyectoRendicion": la rendición de un gasto. Un gasto, una rendición (tenantId, gastoId): rechazar anula el gasto,
--   y re-rendir es cargar un gasto nuevo. Plata en centavos enteros.
-- - "ProyectoAnticipo": plata adelantada; su egreso es "CashMovement"."proyectoAnticipoId" (un asiento por tipo).
--   "reintegradoCentavos": el faltante ya reintegrado (no se paga dos veces).
-- - "ProyectoLiquidacion".pagadaEl/pagadaPor (estado PAGADA); su egreso es "CashMovement"."proyectoLiquidacionId".
-- - "ProyectoPinIngreso": el PIN de ingreso, un código vivo por usuario; fallosEl (ventana deslizante)/bloqueadoHasta
--   NO se reinician al pedir otro código.
-- - Multi-tenant: TODAS las FKs nuevas son compuestas (id, tenantId) contra un UNIQUE (id, tenantId) del padre: la base
--   no deja que una rendición, un anticipo o un asiento apunte a un proyecto, gasto, persona, archivo, liquidación o
--   anticipo de otro negocio (una FK ignora RLS). ON DELETE RESTRICT: SET NULL vaciaría también "tenantId".
--   Los UNIQUE (id, tenantId) sobre tablas existentes siempre se cumplen (id ya es la clave primaria).

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
    "reintegradoCentavos" INTEGER NOT NULL DEFAULT 0,
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

CREATE INDEX "ProyectoAnticipo_tenantId_personaId_idx" ON "ProyectoAnticipo"("tenantId", "personaId");

CREATE UNIQUE INDEX "ProyectoAnticipo_id_tenantId_key" ON "ProyectoAnticipo"("id", "tenantId");

CREATE UNIQUE INDEX "ProyectoPinIngreso_tenantId_userId_key" ON "ProyectoPinIngreso"("tenantId", "userId");

CREATE UNIQUE INDEX "CashMovement_tenantId_proyectoLiquidacionId_type_key" ON "CashMovement"("tenantId", "proyectoLiquidacionId", "type");

CREATE UNIQUE INDEX "CashMovement_tenantId_proyectoAnticipoId_type_key" ON "CashMovement"("tenantId", "proyectoAnticipoId", "type");

CREATE UNIQUE INDEX "Proyecto_id_tenantId_key" ON "Proyecto"("id", "tenantId");

CREATE UNIQUE INDEX "ProyectoGasto_id_tenantId_key" ON "ProyectoGasto"("id", "tenantId");

CREATE UNIQUE INDEX "ProyectoArchivo_id_tenantId_key" ON "ProyectoArchivo"("id", "tenantId");

CREATE UNIQUE INDEX "ProyectoPersona_id_tenantId_key" ON "ProyectoPersona"("id", "tenantId");

CREATE UNIQUE INDEX "ProyectoLiquidacion_id_tenantId_key" ON "ProyectoLiquidacion"("id", "tenantId");

ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoLiquidacionId_tenantId_fkey" FOREIGN KEY ("proyectoLiquidacionId", "tenantId") REFERENCES "ProyectoLiquidacion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoAnticipoId_tenantId_fkey" FOREIGN KEY ("proyectoAnticipoId", "tenantId") REFERENCES "ProyectoAnticipo"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_gastoId_tenantId_fkey" FOREIGN KEY ("gastoId", "tenantId") REFERENCES "ProyectoGasto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "ProyectoPersona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_anticipoId_tenantId_fkey" FOREIGN KEY ("anticipoId", "tenantId") REFERENCES "ProyectoAnticipo"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_archivoId_tenantId_fkey" FOREIGN KEY ("archivoId", "tenantId") REFERENCES "ProyectoArchivo"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_liquidacionId_tenantId_fkey" FOREIGN KEY ("liquidacionId", "tenantId") REFERENCES "ProyectoLiquidacion"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoAnticipo" ADD CONSTRAINT "ProyectoAnticipo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoAnticipo" ADD CONSTRAINT "ProyectoAnticipo_personaId_tenantId_fkey" FOREIGN KEY ("personaId", "tenantId") REFERENCES "ProyectoPersona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoAnticipo" ADD CONSTRAINT "ProyectoAnticipo_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoPinIngreso" ADD CONSTRAINT "ProyectoPinIngreso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Guardas de plata a nivel base (Prisma no las modela; no las toca). Los valores de "medio" son los de
-- MEDIOS_PAGO (src/lib/rendiciones/tipos.ts, única fuente; rendiciones-core.test.ts controla que coincidan).
ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_montoCentavos_check" CHECK ("montoCentavos" > 0);
ALTER TABLE "ProyectoRendicion" ADD CONSTRAINT "ProyectoRendicion_medio_check"
  CHECK (("medio" = 'PROPIO' AND "anticipoId" IS NULL) OR ("medio" = 'ANTICIPO' AND "anticipoId" IS NOT NULL));
ALTER TABLE "ProyectoAnticipo" ADD CONSTRAINT "ProyectoAnticipo_montos_check"
  CHECK ("montoCentavos" > 0 AND "devueltoCentavos" >= 0 AND "devueltoCentavos" <= "montoCentavos" AND "reintegradoCentavos" >= 0);

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
