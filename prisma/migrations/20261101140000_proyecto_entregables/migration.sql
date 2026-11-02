-- ENTREGABLES DE UN PROYECTO (MIA Producciones): cada pieza con sus versiones y la respuesta del cliente desde un link
-- sin login. Aditiva: dos tablas nuevas con RLS y una columna nullable con índice único en "Proyecto", la tabla que
-- crea la primera migración de este lote. No toca nada que usen los demás negocios.

ALTER TABLE "Proyecto" ADD COLUMN "tokenEntregables" TEXT;
CREATE UNIQUE INDEX "Proyecto_tokenEntregables_key" ON "Proyecto"("tokenEntregables");

CREATE TABLE "ProyectoEntregable" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "especificacion" TEXT NOT NULL DEFAULT '',
  "venceEl" TIMESTAMP(3),
  "anuladoEl" TIMESTAMP(3),
  "anuladoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoEntregable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoEntregable_tenantId_proyectoId_idx" ON "ProyectoEntregable"("tenantId", "proyectoId");

CREATE TABLE "ProyectoEntregableVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entregableId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
  "datos" TEXT,
  "url" TEXT,
  "nota" TEXT NOT NULL DEFAULT '',
  "especificacion" TEXT NOT NULL DEFAULT '',
  "subidoPor" TEXT,
  "enviadaEl" TIMESTAMP(3),
  "respondidaEl" TIMESTAMP(3),
  "respondidoPor" TEXT,
  "comentario" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoEntregableVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProyectoEntregableVersion_entregableId_numero_key" ON "ProyectoEntregableVersion"("entregableId", "numero");
CREATE INDEX "ProyectoEntregableVersion_tenantId_entregableId_idx" ON "ProyectoEntregableVersion"("tenantId", "entregableId");

ALTER TABLE "ProyectoEntregable" ADD CONSTRAINT "ProyectoEntregable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoEntregable" ADD CONSTRAINT "ProyectoEntregable_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProyectoEntregableVersion" ADD CONSTRAINT "ProyectoEntregableVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoEntregableVersion" ADD CONSTRAINT "ProyectoEntregableVersion_entregableId_fkey" FOREIGN KEY ("entregableId") REFERENCES "ProyectoEntregable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProyectoEntregable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoEntregable";
CREATE POLICY tenant_isolation ON "ProyectoEntregable"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoEntregableVersion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoEntregableVersion";
CREATE POLICY tenant_isolation ON "ProyectoEntregableVersion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
