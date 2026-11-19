-- M4 · MIA T07 (GSG-MIA-149): el porcentaje de cada persona del equipo del proyecto en cada concepto que se reparte.
-- ADITIVA: crea 1 tabla nueva (con tenantId, RLS forzada y la política por negocio). No agrega columnas a tablas
-- existentes, no cambia tipos, no borra ni mueve datos. La función de cada persona ya vive en ProyectoEquipo.funcion.
-- Porcentajes en puntos básicos enteros (25 % = 2500). La empresa recibe el resto: no tiene fila.
-- El redondeo no se reparte (queda 100 % en la empresa): la base rechaza una fila de REDONDEO.
-- Se puede correr dos veces. Sin la tabla, el reparto es el inicial del negocio (`hayM4`). Aplicarla en Neon es Gate 2.
-- Vuelta atrás: rollback.sql en esta carpeta.

CREATE TABLE IF NOT EXISTS "ProyectoEquipoReparto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "equipoId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "creadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoEquipoReparto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProyectoEquipoReparto_puntos_check" CHECK ("puntos" >= 0 AND "puntos" <= 10000),
    CONSTRAINT "ProyectoEquipoReparto_redondeo_check" CHECK (upper("concepto") <> 'REDONDEO')
);

CREATE INDEX IF NOT EXISTS "ProyectoEquipoReparto_tenantId_proyectoId_idx" ON "ProyectoEquipoReparto"("tenantId", "proyectoId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoEquipoReparto_equipoId_concepto_key" ON "ProyectoEquipoReparto"("equipoId", "concepto");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoEquipoReparto_tenantId_fkey') THEN
    ALTER TABLE "ProyectoEquipoReparto" ADD CONSTRAINT "ProyectoEquipoReparto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoEquipoReparto_proyectoId_fkey') THEN
    ALTER TABLE "ProyectoEquipoReparto" ADD CONSTRAINT "ProyectoEquipoReparto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoEquipoReparto_equipoId_fkey') THEN
    ALTER TABLE "ProyectoEquipoReparto" ADD CONSTRAINT "ProyectoEquipoReparto_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "ProyectoEquipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ProyectoEquipoReparto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoEquipoReparto" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoEquipoReparto";
CREATE POLICY tenant_isolation ON "ProyectoEquipoReparto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProyectoEquipoReparto" TO app_rls;
  END IF;
END $$;
