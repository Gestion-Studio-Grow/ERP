-- TALLER DE STANDS (GSG-MIA-004 · T2): catálogo de piezas con costo interno y despiece por stand (= Proyecto).
-- Aditiva: dos tablas nuevas con RLS por negocio. Ningún otro negocio las usa. El código tolera que no existan
-- (P2021 → vacío amable) hasta que se aplique. ESCRITA, NO APLICADA (Gate 2).
-- FKs compuestas (id, tenantId) a Proyecto y TallerPieza: la base misma impide un despiece con datos de otro negocio.
-- FORCE ROW LEVEL SECURITY: ni el dueño de las tablas lee un taller ajeno sin `app.current_tenant_id`.

CREATE TABLE "TallerPieza" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "unidad" TEXT NOT NULL DEFAULT 'u',
  "costoUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "horasStd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "productId" TEXT,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TallerPieza_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TallerPieza_id_tenantId_key" ON "TallerPieza"("id", "tenantId");
CREATE INDEX "TallerPieza_tenantId_activa_idx" ON "TallerPieza"("tenantId", "activa");
ALTER TABLE "TallerPieza" ADD CONSTRAINT "TallerPieza_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TallerDespiece" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "piezaId" TEXT NOT NULL,
  "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "costoUnitSnap" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TallerDespiece_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TallerDespiece_proyectoId_piezaId_key" ON "TallerDespiece"("proyectoId", "piezaId");
CREATE INDEX "TallerDespiece_tenantId_proyectoId_idx" ON "TallerDespiece"("tenantId", "proyectoId");
ALTER TABLE "TallerDespiece" ADD CONSTRAINT "TallerDespiece_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TallerDespiece" ADD CONSTRAINT "TallerDespiece_proyectoId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TallerDespiece" ADD CONSTRAINT "TallerDespiece_piezaId_fkey" FOREIGN KEY ("piezaId", "tenantId") REFERENCES "TallerPieza"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TallerPieza" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerPieza" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerPieza";
CREATE POLICY tenant_isolation ON "TallerPieza"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "TallerDespiece" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TallerDespiece" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TallerDespiece";
CREATE POLICY tenant_isolation ON "TallerDespiece"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
