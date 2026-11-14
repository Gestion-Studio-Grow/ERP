-- Proyectos · MIA T1: fórmula de precio por capas, comisiones por persona y fecha del evento «a confirmar».
-- ADITIVA: sólo agrega dos tablas; no toca ninguna existente ni crea enums. Sin aplicar (Gate 2): el código tolera
-- su ausencia (P2021 → la ficha sigue con el margen único, sin la pestaña de precio y sin el importador).
-- Sin fila en ProyectoPrecioConfig, o con "activa" = false, ningún negocio cambia.
-- Sin IF NOT EXISTS a propósito: el detector de aditividad (scripts/publicar/lib/sql.mjs) frena las formas idempotentes.
-- Vuelta atrás (borra lo cargado en estas tablas): DROP TABLE IF EXISTS "ProyectoVenta"; DROP TABLE IF EXISTS
-- "ProyectoPrecioConfig"; y borrar su fila de "_prisma_migrations".

CREATE TABLE "ProyectoPrecioConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "activa" BOOLEAN NOT NULL DEFAULT false,
  "rentabilidadBp" INTEGER NOT NULL DEFAULT 3000,
  "comisionProductorBp" INTEGER NOT NULL DEFAULT 1000,
  "comisionComercialBp" INTEGER NOT NULL DEFAULT 1000,
  "margenErrorBp" INTEGER NOT NULL DEFAULT 500,
  "impuestosBp" INTEGER NOT NULL DEFAULT 700,
  "topeRedondeoBp" INTEGER NOT NULL DEFAULT 500,
  "ahorroEmpresaBp" INTEGER NOT NULL DEFAULT 7500,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProyectoPrecioConfig_pkey" PRIMARY KEY ("id"),
  -- La misma validación que el código (precio-capas-core.ts): la base no admite un porcentaje imposible.
  CONSTRAINT "ProyectoPrecioConfig_bp_check" CHECK (
    "rentabilidadBp" BETWEEN 0 AND 100000 AND
    "comisionProductorBp" BETWEEN 0 AND 10000 AND
    "comisionComercialBp" BETWEEN 0 AND 10000 AND
    "margenErrorBp" BETWEEN 0 AND 10000 AND
    "impuestosBp" BETWEEN 0 AND 5000 AND
    "topeRedondeoBp" BETWEEN 0 AND 5000 AND
    "ahorroEmpresaBp" BETWEEN 0 AND 10000
  )
);
CREATE UNIQUE INDEX "ProyectoPrecioConfig_tenantId_key" ON "ProyectoPrecioConfig"("tenantId");
ALTER TABLE "ProyectoPrecioConfig" ADD CONSTRAINT "ProyectoPrecioConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProyectoVenta" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "productorId" TEXT,
  "comercialId" TEXT,
  "precioFinalCent" BIGINT,
  "fechaEventoTexto" TEXT,
  "statusImportado" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProyectoVenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProyectoVenta_precioFinalCent_check" CHECK ("precioFinalCent" IS NULL OR "precioFinalCent" > 0)
);
CREATE UNIQUE INDEX "ProyectoVenta_proyectoId_key" ON "ProyectoVenta"("proyectoId");
CREATE UNIQUE INDEX "ProyectoVenta_proyectoId_tenantId_key" ON "ProyectoVenta"("proyectoId", "tenantId");
CREATE INDEX "ProyectoVenta_tenantId_idx" ON "ProyectoVenta"("tenantId");

ALTER TABLE "ProyectoVenta" ADD CONSTRAINT "ProyectoVenta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Llaves compuestas (id, tenantId): ni el proyecto ni las personas pueden ser de otro negocio (la base lo impide, no sólo RLS).
ALTER TABLE "ProyectoVenta" ADD CONSTRAINT "ProyectoVenta_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProyectoVenta" ADD CONSTRAINT "ProyectoVenta_productorId_tenantId_fkey" FOREIGN KEY ("productorId", "tenantId") REFERENCES "ProyectoPersona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoVenta" ADD CONSTRAINT "ProyectoVenta_comercialId_tenantId_fkey" FOREIGN KEY ("comercialId", "tenantId") REFERENCES "ProyectoPersona"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS en la misma migración (check-coverage.mjs): cada negocio ve sólo lo suyo.
ALTER TABLE "ProyectoPrecioConfig" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoPrecioConfig";
CREATE POLICY tenant_isolation ON "ProyectoPrecioConfig"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoVenta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoVenta";
CREATE POLICY tenant_isolation ON "ProyectoVenta"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
