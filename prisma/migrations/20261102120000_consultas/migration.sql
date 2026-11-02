-- Consultas de potenciales clientes: la bandeja donde llega lo que hoy se pierde. Sólo agrega tablas; no toca datos existentes.

CREATE TABLE "Consulta" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "canal" TEXT NOT NULL,
  "nombre" TEXT NOT NULL DEFAULT '',
  "email" TEXT,
  "telefono" TEXT,
  "empresa" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'NUEVA',
  "intencion" TEXT NOT NULL DEFAULT 'NUEVA',
  "motivos" TEXT[],
  "brief" JSONB,
  "proyectoId" TEXT,
  "ultimaActividad" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Consulta_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Consulta_tenantId_estado_ultimaActividad_idx" ON "Consulta"("tenantId", "estado", "ultimaActividad");

CREATE TABLE "ConsultaMensaje" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "consultaId" TEXT NOT NULL,
  "direccion" TEXT NOT NULL,
  "origen" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "envio" TEXT NOT NULL DEFAULT 'NO_APLICA',
  "problemas" TEXT[],
  "autor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsultaMensaje_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConsultaMensaje_tenantId_consultaId_createdAt_idx" ON "ConsultaMensaje"("tenantId", "consultaId", "createdAt");

ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consulta" ADD CONSTRAINT "Consulta_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConsultaMensaje" ADD CONSTRAINT "ConsultaMensaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsultaMensaje" ADD CONSTRAINT "ConsultaMensaje_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Consulta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Consulta";
CREATE POLICY tenant_isolation ON "Consulta"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ConsultaMensaje" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ConsultaMensaje";
CREATE POLICY tenant_isolation ON "ConsultaMensaje"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
