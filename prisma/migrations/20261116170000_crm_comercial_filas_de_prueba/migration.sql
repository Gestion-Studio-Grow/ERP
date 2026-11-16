-- CRM comercial · filas de la PRUEBA (GSG-CRM-011 parte 3 · diseño CRM-REINGENIERIA.md §6). Anota qué filas cargó
-- la prueba con los 20 leads ficticios y los clientes activos (y cómo entró cada lead), para que la limpieza borre
-- SÓLO eso y sólo de un negocio. La marca vive en esta tabla y no como columna en cada tabla: MarcaRelevada y
-- EventoRelevado ya están en producción y una columna nueva obligaría a `select` en todas sus lecturas.
-- ADITIVA: una tabla nueva con RLS. Sin enum, sin DROP (salvo DROP POLICY IF EXISTS del molde), sin ALTER COLUMN.
-- Depende de 20261116150000_crm_comercial y 20261116160000_crm_comercial_pronostico (no las toca).
-- SIN APLICAR (Gate 2): sin ella, la carga contesta «falta un paso de base de datos» y no escribe nada.
-- Vuelta atrás: DROP TABLE "FilaDePruebaCrm";  (después de correr la limpieza, si hubo carga)

-- CreateTable
CREATE TABLE "FilaDePruebaCrm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "filaId" TEXT,
    "nota" TEXT,
    "lote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilaDePruebaCrm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FilaDePruebaCrm_tenantId_entidad_idx" ON "FilaDePruebaCrm"("tenantId", "entidad");

-- CreateIndex
CREATE UNIQUE INDEX "FilaDePruebaCrm_tenantId_entidad_clave_key" ON "FilaDePruebaCrm"("tenantId", "entidad", "clave");

-- AddForeignKey
ALTER TABLE "FilaDePruebaCrm" ADD CONSTRAINT "FilaDePruebaCrm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── CHECKs ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "FilaDePruebaCrm" ADD CONSTRAINT "FilaDePruebaCrm_entidad_check" CHECK ("entidad" IN ('LEAD', 'CLIENTE', 'MARCA', 'EVENTO', 'EVENTO_MARCA', 'OPORTUNIDAD', 'CONTACTO'));
ALTER TABLE "FilaDePruebaCrm" ADD CONSTRAINT "FilaDePruebaCrm_textos_check" CHECK (length(btrim("clave")) > 0 AND length(btrim("lote")) > 0 AND ("nota" IS NULL OR length("nota") <= 2000));

-- ── RLS: aislamiento por negocio (mismo molde que 20261116150000_crm_comercial) ─────────────────────────

ALTER TABLE "FilaDePruebaCrm" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FilaDePruebaCrm";
CREATE POLICY tenant_isolation ON "FilaDePruebaCrm"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
