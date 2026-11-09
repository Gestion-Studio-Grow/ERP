-- TALLER DE STANDS (GSG-MIA-004 · T4): pedidos de materiales a un proveedor para un stand (= Proyecto).
-- PEDIDO → RECIBIDO | ANULADO. Al recibirlo se crea UN ProyectoGasto rubro «Materiales» y queda en "gastoId", que es
-- único: dos recepciones (doble clic) no pueden dejar dos gastos. No usa StockPurchase (es fiscal); el stock real es T6.
-- Aditiva: una tabla nueva con RLS por negocio + un índice único (id, tenantId) en "Supplier" (destino de la FK
-- compuesta; no cambia datos: "id" ya es único). FKs compuestas (x, tenantId) a Proyecto, Supplier y ProyectoGasto: la
-- base no deja apuntar a nada de otro negocio. Requiere los únicos (id, tenantId) de Proyecto y ProyectoGasto
-- (`20261104121000_rendiciones`). El código tolera que no exista (P2021 → aviso amable). ESCRITA, NO APLICADA (Gate 2).

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_id_tenantId_key" ON "Supplier"("id", "tenantId");

CREATE TABLE "TallerPedido" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "supplierId" TEXT,
  "proveedorNombre" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'PEDIDO',
  "total" DOUBLE PRECISION NOT NULL,
  "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pedidoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recibidoEl" TIMESTAMP(3),
  "gastoId" TEXT,
  "anuladoEl" TIMESTAMP(3),
  "cargadoPor" TEXT,
  "envioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TallerPedido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TallerPedido_estado_check" CHECK ("estado" IN ('PEDIDO', 'RECIBIDO', 'ANULADO')),
  CONSTRAINT "TallerPedido_total_check" CHECK ("total" > 0),
  CONSTRAINT "TallerPedido_iva_check" CHECK ("iva" >= 0)
);
CREATE UNIQUE INDEX "TallerPedido_id_tenantId_key" ON "TallerPedido"("id", "tenantId");
-- Un gasto por pedido (NULL no choca: los pedidos sin recibir no tienen gasto).
CREATE UNIQUE INDEX "TallerPedido_gastoId_key" ON "TallerPedido"("gastoId");
-- Doble clic al crear: el formulario manda un token; la base deja un solo pedido por token.
CREATE UNIQUE INDEX "TallerPedido_tenantId_envioId_key" ON "TallerPedido"("tenantId", "envioId");
CREATE INDEX "TallerPedido_tenantId_proyectoId_idx" ON "TallerPedido"("tenantId", "proyectoId");
ALTER TABLE "TallerPedido" ADD CONSTRAINT "TallerPedido_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerPedido" ADD CONSTRAINT "TallerPedido_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerPedido" ADD CONSTRAINT "TallerPedido_supplierId_tenantId_fkey" FOREIGN KEY ("supplierId", "tenantId") REFERENCES "Supplier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerPedido" ADD CONSTRAINT "TallerPedido_gastoId_tenantId_fkey" FOREIGN KEY ("gastoId", "tenantId") REFERENCES "ProyectoGasto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TallerPedido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerPedido" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerPedido";
CREATE POLICY tenant_isolation ON "TallerPedido"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
