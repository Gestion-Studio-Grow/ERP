-- Motor de facturación · pedido 3 de la consola del contador: las reglas de abono del estudio
-- («a este cliente facturale todos los meses $X a Fulano») pasan de versiones en AuditLog a una
-- tabla con índice. Aditiva: una tabla nueva, sin tocar ninguna existente ni datos.
--   · "tenantId" es el ESTUDIO. La llave foránea de dos columnas (tenantId, clienteTenantId) →
--     "CarteraCliente" hace que la base impida una regla sobre un negocio que no está en la cartera
--     de ese estudio (VARIANTE, ADR-055).
--   · Plata en numeric(14,2) (ADR-100). Estado, concepto, documento, importe y meses con CHECK.
-- SIN APLICAR en Neon y fuera de prisma/lote-deploy.txt: se aplica con OK del dueño (Gate 2).
-- RLS viaja con la migración (misma política que prisma/rls/0001_enable_rls.sql).

-- CreateTable
CREATE TABLE "ReglaFacturacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteTenantId" TEXT NOT NULL,
    "receptorNombre" TEXT NOT NULL,
    "receptorDocTipo" INTEGER NOT NULL,
    "receptorDocNro" TEXT,
    "receptorCondicionIva" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,
    "concepto" INTEGER NOT NULL,
    "desde" TEXT NOT NULL,
    "hasta" TEXT,
    "diasVencimiento" INTEGER NOT NULL DEFAULT 10,
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReglaFacturacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReglaFacturacion_estado_check" CHECK ("estado" IN ('activa', 'baja')),
    CONSTRAINT "ReglaFacturacion_concepto_check" CHECK ("concepto" IN (1, 2, 3)),
    CONSTRAINT "ReglaFacturacion_receptorDocTipo_check" CHECK ("receptorDocTipo" IN (80, 86, 87, 96, 99)),
    CONSTRAINT "ReglaFacturacion_importe_check" CHECK ("importe" > 0),
    CONSTRAINT "ReglaFacturacion_meses_check" CHECK (
      "desde" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      AND ("hasta" IS NULL OR ("hasta" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND "hasta" >= "desde"))
    ),
    CONSTRAINT "ReglaFacturacion_diasVencimiento_check" CHECK ("diasVencimiento" BETWEEN 0 AND 365)
);

-- CreateIndex
CREATE INDEX "ReglaFacturacion_tenantId_clienteTenantId_idx" ON "ReglaFacturacion"("tenantId", "clienteTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaFacturacion_tenantId_id_key" ON "ReglaFacturacion"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "ReglaFacturacion" ADD CONSTRAINT "ReglaFacturacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaFacturacion" ADD CONSTRAINT "ReglaFacturacion_tenantId_clienteTenantId_fkey" FOREIGN KEY ("tenantId", "clienteTenantId") REFERENCES "CarteraCliente"("tenantId", "clienteTenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── RLS de la tabla nueva (misma política que prisma/rls/0001_enable_rls.sql) ──
ALTER TABLE "ReglaFacturacion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ReglaFacturacion";
CREATE POLICY tenant_isolation ON "ReglaFacturacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
