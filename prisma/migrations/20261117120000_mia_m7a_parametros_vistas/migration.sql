-- M7a · MIA T03 (GSG-MIA-054): parámetros del módulo de proyectos por negocio y vistas guardadas.
-- ADITIVA: sólo crea 3 tablas nuevas, sus índices y sus políticas. No toca ninguna tabla existente ni datos.
-- Se puede correr dos veces (IF NOT EXISTS, DROP POLICY IF EXISTS): la segunda corrida no cambia nada.
-- Sin filas en ProyectoParametro el código lee los valores del rubro; sin estas tablas, el código también los lee
-- (tolera la ausencia de la migración: parametros/leer.server.ts y vistas.server.ts).
-- Aplicarla en Neon es Gate 2 del dueño. Vuelta atrás: rollback.sql en esta carpeta (borra sólo estas 3 tablas).

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoParametro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "actualizadoPor" TEXT NOT NULL,
    "actualizadoNombre" TEXT NOT NULL,
    "actualizadoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoParametro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoParametroHistorial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "antes" JSONB,
    "despues" JSONB,
    "provisionalAntes" BOOLEAN,
    "provisionalDespues" BOOLEAN,
    "autorId" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoParametroHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoVista" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lista" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "alcance" TEXT NOT NULL,
    "propietario" TEXT NOT NULL,
    "columnas" JSONB NOT NULL,
    "filtros" JSONB NOT NULL,
    "agrupacion" TEXT,
    "orden" JSONB,
    "creadaPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoVista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoParametro_tenantId_clave_key" ON "ProyectoParametro"("tenantId", "clave");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProyectoParametroHistorial_tenantId_clave_createdAt_idx" ON "ProyectoParametroHistorial"("tenantId", "clave", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProyectoParametroHistorial_tenantId_createdAt_idx" ON "ProyectoParametroHistorial"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProyectoVista_tenantId_lista_idx" ON "ProyectoVista"("tenantId", "lista");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoVista_tenantId_lista_alcance_propietario_nombre_key" ON "ProyectoVista"("tenantId", "lista", "alcance", "propietario", "nombre");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoParametro_tenantId_fkey') THEN
    ALTER TABLE "ProyectoParametro" ADD CONSTRAINT "ProyectoParametro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoParametroHistorial_tenantId_fkey') THEN
    ALTER TABLE "ProyectoParametroHistorial" ADD CONSTRAINT "ProyectoParametroHistorial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoVista_tenantId_fkey') THEN
    ALTER TABLE "ProyectoVista" ADD CONSTRAINT "ProyectoVista_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Aislamiento por negocio: política por tenant y RLS FORZADA (también para el dueño de las tablas) ──

ALTER TABLE "ProyectoParametro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoParametro" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoParametro";
CREATE POLICY tenant_isolation ON "ProyectoParametro"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoParametroHistorial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoParametroHistorial" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoParametroHistorial";
CREATE POLICY tenant_isolation ON "ProyectoParametroHistorial"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoVista" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoVista" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoVista";
CREATE POLICY tenant_isolation ON "ProyectoVista"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- El rol de la app (app_rls) hereda los permisos por defecto del esquema (prisma/rls/0002_app_role.sql); si existe, se
-- le dan explícitos por si los permisos por defecto no alcanzaran a tablas creadas por esta migración.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProyectoParametro", "ProyectoParametroHistorial", "ProyectoVista" TO app_rls;
  END IF;
END $$;
