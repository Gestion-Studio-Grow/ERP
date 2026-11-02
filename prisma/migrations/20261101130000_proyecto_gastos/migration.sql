-- GASTOS REALES DE UN PROYECTO (MIA Producciones): lo que se le paga o se le debe a cada proveedor por un trabajo,
-- para comparar el costo real contra el presupuestado. Aditiva: una tabla nueva con RLS y una columna nullable con
-- índice único en "CashMovement" (la clave del asiento de cada pago, como "proyectoPagoId"). Los demás negocios no
-- la usan: queda nula.

CREATE TABLE "ProyectoGasto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "supplierId" TEXT,
  "rubro" TEXT NOT NULL DEFAULT 'General',
  "descripcion" TEXT NOT NULL,
  "neto" DOUBLE PRECISION NOT NULL,
  "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comprobante" TEXT,
  "pagadoEl" TIMESTAMP(3),
  "medio" TEXT,
  "pagadoPor" TEXT,
  "anuladoEl" TIMESTAMP(3),
  "anuladoPor" TEXT,
  "cargadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoGasto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoGasto_tenantId_proyectoId_idx" ON "ProyectoGasto"("tenantId", "proyectoId");
CREATE INDEX "ProyectoGasto_tenantId_supplierId_idx" ON "ProyectoGasto"("tenantId", "supplierId");

ALTER TABLE "ProyectoGasto" ADD CONSTRAINT "ProyectoGasto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoGasto" ADD CONSTRAINT "ProyectoGasto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoGasto" ADD CONSTRAINT "ProyectoGasto_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashMovement" ADD COLUMN "proyectoGastoId" TEXT;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoGastoId_fkey"
  FOREIGN KEY ("proyectoGastoId") REFERENCES "ProyectoGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CashMovement_tenantId_proyectoGastoId_type_key" ON "CashMovement"("tenantId", "proyectoGastoId", "type");

ALTER TABLE "ProyectoGasto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoGasto";
CREATE POLICY tenant_isolation ON "ProyectoGasto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
