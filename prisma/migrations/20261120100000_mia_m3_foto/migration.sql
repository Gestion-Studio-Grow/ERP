-- M3 · MIA T07 (GSG-MIA-149): el precio «por total» del proyecto y la foto de la aprobación del cliente.
-- ADITIVA: crea 2 tablas nuevas (con tenantId, RLS forzada y la política por negocio) y un trigger que rechaza todo UPDATE
-- de la foto. No agrega columnas a tablas existentes, no cambia tipos, no borra ni mueve datos.
-- Plata nueva en centavos enteros (BIGINT). Los porcentajes, en JSON con hasta dos decimales.
-- Se puede correr dos veces (IF NOT EXISTS, DROP ... IF EXISTS): la segunda corrida no cambia nada.
-- Sin estas tablas el código lee como antes (precio-proyecto.server.ts: `hayM3`). Aplicarla en Neon es Gate 2 del dueño.
-- Vuelta atrás: rollback.sql en esta carpeta.

-- CreateTable: el tablero del proyecto (uno por proyecto).
CREATE TABLE IF NOT EXISTS "ProyectoPrecio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "totalVentaCentavos" BIGINT,
    "subtotalCentavos" BIGINT,
    "redondeoBrutoCentavos" BIGINT,
    "redondeoNetoCentavos" BIGINT,
    "porcentajes" JSONB,
    "pendientes" JSONB,
    "pendientesPor" TEXT,
    "pendientesMotivo" TEXT,
    "topeAprobadoCentavos" BIGINT,
    "topeAprobadoPor" TEXT,
    "topeAprobadoEl" TIMESTAMP(3),
    "actualizadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoPrecio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProyectoPrecio_total_check" CHECK ("totalVentaCentavos" IS NULL OR "totalVentaCentavos" >= 0)
);

-- CreateTable: la foto de cada aprobación del cliente (una por versión).
CREATE TABLE IF NOT EXISTS "ProyectoPrecioFoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "modo" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "tcVenta" DOUBLE PRECISION,
    "ivaPct" DOUBLE PRECISION NOT NULL,
    "costoOriginalCentavos" BIGINT NOT NULL,
    "adicionalesCentavos" BIGINT NOT NULL,
    "subtotalCentavos" BIGINT NOT NULL,
    "iibGaCentavos" BIGINT NOT NULL,
    "totalVentaCentavos" BIGINT NOT NULL,
    "redondeoBrutoCentavos" BIGINT NOT NULL,
    "redondeoNetoCentavos" BIGINT NOT NULL,
    "parametros" JSONB NOT NULL,
    "participantes" JSONB NOT NULL,
    "aprobadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoPrecioFoto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProyectoPrecioFoto_modo_check" CHECK ("modo" IN ('POR_TOTAL', 'POR_ITEM')),
    CONSTRAINT "ProyectoPrecioFoto_total_check" CHECK ("totalVentaCentavos" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoPrecio_proyectoId_key" ON "ProyectoPrecio"("proyectoId");
CREATE INDEX IF NOT EXISTS "ProyectoPrecio_tenantId_idx" ON "ProyectoPrecio"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoPrecioFoto_presupuestoId_key" ON "ProyectoPrecioFoto"("presupuestoId");
CREATE INDEX IF NOT EXISTS "ProyectoPrecioFoto_tenantId_proyectoId_idx" ON "ProyectoPrecioFoto"("tenantId", "proyectoId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoPrecio_tenantId_fkey') THEN
    ALTER TABLE "ProyectoPrecio" ADD CONSTRAINT "ProyectoPrecio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoPrecio_proyectoId_fkey') THEN
    ALTER TABLE "ProyectoPrecio" ADD CONSTRAINT "ProyectoPrecio_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoPrecioFoto_tenantId_fkey') THEN
    ALTER TABLE "ProyectoPrecioFoto" ADD CONSTRAINT "ProyectoPrecioFoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoPrecioFoto_proyectoId_fkey') THEN
    ALTER TABLE "ProyectoPrecioFoto" ADD CONSTRAINT "ProyectoPrecioFoto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoPrecioFoto_presupuestoId_fkey') THEN
    ALTER TABLE "ProyectoPrecioFoto" ADD CONSTRAINT "ProyectoPrecioFoto_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "ProyectoPresupuesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- La foto no se reescribe: ninguna acción, ni un UPDATE a mano por la app, la cambia (O18).
CREATE OR REPLACE FUNCTION "proyecto_precio_foto_inmutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La foto del precio aprobado no se modifica (M3).';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "ProyectoPrecioFoto_inmutable" ON "ProyectoPrecioFoto";
CREATE TRIGGER "ProyectoPrecioFoto_inmutable" BEFORE UPDATE ON "ProyectoPrecioFoto" FOR EACH ROW EXECUTE FUNCTION "proyecto_precio_foto_inmutable"();

-- RLS: cada negocio ve y escribe sólo lo suyo; forzada también para el dueño de la tabla.
ALTER TABLE "ProyectoPrecio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoPrecio" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoPrecio";
CREATE POLICY tenant_isolation ON "ProyectoPrecio"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoPrecioFoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoPrecioFoto" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoPrecioFoto";
CREATE POLICY tenant_isolation ON "ProyectoPrecioFoto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProyectoPrecio" TO app_rls;
    -- La foto: se lee, se crea y se borra con su proyecto; UPDATE no (y el trigger lo frena igual).
    GRANT SELECT, INSERT, DELETE ON "ProyectoPrecioFoto" TO app_rls;
  END IF;
END $$;
