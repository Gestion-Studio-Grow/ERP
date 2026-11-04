-- Agenda de contenido por negocio (docs/producto/contenido/PLAN.md §2). Sólo agrega una tabla; no toca datos existentes.
-- Gate 2: se escribe SIN aplicar. Mientras falte, la pantalla /admin/contenido usa el modo demo (almacén local).

CREATE TABLE "PublicacionAgendada" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "fecha" TEXT NOT NULL,
  "hora" TEXT NOT NULL,
  "canal" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'borrador',
  "tipo" TEXT NOT NULL,
  "plantilla" TEXT NOT NULL,
  "formato" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "campos" JSONB NOT NULL,
  "caption" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicacionAgendada_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PublicacionAgendada_tenantId_fecha_idx" ON "PublicacionAgendada"("tenantId", "fecha");

ALTER TABLE "PublicacionAgendada" ADD CONSTRAINT "PublicacionAgendada_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PublicacionAgendada" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PublicacionAgendada";
CREATE POLICY tenant_isolation ON "PublicacionAgendada"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
