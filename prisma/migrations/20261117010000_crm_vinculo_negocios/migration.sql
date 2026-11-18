-- CRM comercial · ARM como negocio propio (GSG-CRM-017 · T4 · decisión del dueño del 16/11/2026). El ARM (p. ej. `arm-mia`)
-- tiene sólo el CRM y asigna a SUS negocios vinculados (MIA Producciones, MIA Taller): el proyecto nace en el destino,
-- en dos fases dentro de una transacción (patrón `trasladoTransaction`, sin saltear RLS).
--
-- Qué agrega, una cosa por vez:
--   1. "VinculoNegocio" (en el ARM): ARM → destino, por tipo de destino (AGENCIA · TALLER). Lo carga SÓLO GSG como dueño
--      de la base: al rol de la app (`app_rls`) se le sacan INSERT, UPDATE y DELETE (sólo lee). Sin vínculo no hay
--      asignación (V2).
--   2. "AsignacionRecibida" (en el destino): qué proyecto nació de qué oportunidad del ARM. Única por oportunidad: un
--      doble clic, dos personas a la vez o un reintento no crean dos proyectos (V3), aunque se saltee el control del ARM.
--   3. Tres columnas OPCIONALES en "Oportunidad": `destinoTenantId` y `proyectoDestinoId` (a qué negocio y a qué proyecto
--      fue; sólo se lee su estado, V6) y `consultaId` (la consulta del formulario de la que nació: una sola puerta, V8),
--      con índice único por negocio (una consulta → una oportunidad).
--
-- ADITIVA: dos tablas nuevas con RLS y tres columnas que aceptan NULL. Sin enum, sin DROP (salvo DROP POLICY IF EXISTS del
-- molde), sin ALTER COLUMN, sin UPDATE ni DELETE. No carga datos: el vínculo de un negocio real lo carga GSG aparte.
-- Depende de 20261116150000_crm_comercial (tabla "Oportunidad") y del modelo "Consulta" (no los modifica).
-- SIN APLICAR (Gate 2): sin ella, asignar contesta «falta un paso de base de datos» y no escribe nada.
-- Vuelta atrás: DROP TABLE "AsignacionRecibida"; DROP TABLE "VinculoNegocio";
--               ALTER TABLE "Oportunidad" DROP COLUMN "destinoTenantId", DROP COLUMN "proyectoDestinoId", DROP COLUMN "consultaId";

-- ── 1. VinculoNegocio ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "VinculoNegocio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "destinoTenantId" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "cargadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VinculoNegocio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VinculoNegocio_destinoTenantId_idx" ON "VinculoNegocio"("destinoTenantId");
CREATE UNIQUE INDEX "VinculoNegocio_tenantId_destino_key" ON "VinculoNegocio"("tenantId", "destino");
CREATE UNIQUE INDEX "VinculoNegocio_tenantId_destinoTenantId_key" ON "VinculoNegocio"("tenantId", "destinoTenantId");

ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_destinoTenantId_fkey" FOREIGN KEY ("destinoTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_destino_check" CHECK ("destino" IN ('AGENCIA', 'TALLER'));
ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_otro_negocio_check" CHECK ("tenantId" <> "destinoTenantId");
ALTER TABLE "VinculoNegocio" ADD CONSTRAINT "VinculoNegocio_textos_check" CHECK (length(btrim("cargadoPor")) > 0 AND length("cargadoPor") <= 200);

-- ── 2. AsignacionRecibida ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE "AsignacionRecibida" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "origenTenantId" TEXT NOT NULL,
    "origenOportunidadId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsignacionRecibida_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AsignacionRecibida_tenantId_origenTenantId_origenOportunidadId_key" ON "AsignacionRecibida"("tenantId", "origenTenantId", "origenOportunidadId");
CREATE UNIQUE INDEX "AsignacionRecibida_tenantId_proyectoId_key" ON "AsignacionRecibida"("tenantId", "proyectoId");

ALTER TABLE "AsignacionRecibida" ADD CONSTRAINT "AsignacionRecibida_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AsignacionRecibida" ADD CONSTRAINT "AsignacionRecibida_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AsignacionRecibida" ADD CONSTRAINT "AsignacionRecibida_otro_negocio_check" CHECK ("tenantId" <> "origenTenantId");

-- ── 3. Oportunidad: a dónde fue y de qué consulta nació ─────────────────────────────────────────────────
ALTER TABLE "Oportunidad" ADD COLUMN "destinoTenantId" TEXT;
ALTER TABLE "Oportunidad" ADD COLUMN "proyectoDestinoId" TEXT;
ALTER TABLE "Oportunidad" ADD COLUMN "consultaId" TEXT;

CREATE UNIQUE INDEX "Oportunidad_tenantId_consultaId_key" ON "Oportunidad"("tenantId", "consultaId");
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES "Consulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Las dos columnas del destino van juntas: o las dos o ninguna, y nunca el propio negocio.
ALTER TABLE "Oportunidad" ADD CONSTRAINT "Oportunidad_destino_negocio_check" CHECK (("destinoTenantId" IS NULL) = ("proyectoDestinoId" IS NULL) AND ("destinoTenantId" IS NULL OR "destinoTenantId" <> "tenantId"));

-- ── RLS: aislamiento por negocio (mismo molde que 20261116150000_crm_comercial) ─────────────────────────
ALTER TABLE "VinculoNegocio" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "VinculoNegocio";
CREATE POLICY tenant_isolation ON "VinculoNegocio"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AsignacionRecibida" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AsignacionRecibida";
CREATE POLICY tenant_isolation ON "AsignacionRecibida"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── El vínculo lo carga sólo GSG: la app lo lee y nada más ──────────────────────────────────────────────
-- Si `app_rls` todavía no existe (la base sólo con migraciones), no hay nada que sacarle: `prisma/rls/0002_app_role.sql`
-- repite este REVOKE después de su GRANT general, así el orden de los dos scripts no importa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    REVOKE INSERT, UPDATE, DELETE ON "VinculoNegocio" FROM app_rls;
  END IF;
END $$;
