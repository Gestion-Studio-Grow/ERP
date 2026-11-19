-- M7b · MIA T09 (GSG-MIA-151, plan MIA-50 § 1.3): fecha prevista y real por etapa (O05), obligaciones a mano (O07) y la
-- salida «cancelado» (O04).
-- ADITIVA: sólo crea 3 tablas nuevas, sus índices, sus llaves y sus políticas. No toca ninguna tabla existente ni datos.
-- Cada tabla nace con `tenantId`, llave compuesta (proyectoId, tenantId) que no cruza de negocio y RLS forzada.
-- Sin plata: ninguna columna de importe (la regla de centavos no aplica).
-- Se puede correr dos veces (IF NOT EXISTS, DROP POLICY IF EXISTS): la segunda corrida no cambia nada.
-- Sin estas tablas el código sigue andando (fechas y obligaciones vacías; cancelar responde «falta la base»).
-- Aplicarla en Neon es Gate 2 del dueño. Vuelta atrás: rollback.sql en esta carpeta (borra sólo estas 3 tablas).

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoEtapaFecha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "etapaId" TEXT NOT NULL,
    "prevista" TIMESTAMP(3),
    "real" TIMESTAMP(3),
    "previstaPor" TEXT,
    "realPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoEtapaFecha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoObligacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "responsableId" TEXT,
    "responsableNombre" TEXT NOT NULL,
    "venceEl" TIMESTAMP(3) NOT NULL,
    "diasAviso" INTEGER NOT NULL,
    "avisadaEl" TIMESTAMP(3),
    "hechaEl" TIMESTAMP(3),
    "envio" TEXT NOT NULL,
    "creadaPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoObligacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoCancelacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "criterio" TEXT NOT NULL,
    "cuotasAnuladas" INTEGER NOT NULL,
    "pendientes" JSONB NOT NULL,
    "autorId" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "canceladoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reabiertoEl" TIMESTAMP(3),
    "reabiertoPor" TEXT,

    CONSTRAINT "ProyectoCancelacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProyectoEtapaFecha_tenantId_prevista_idx" ON "ProyectoEtapaFecha"("tenantId", "prevista");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoEtapaFecha_tenantId_proyectoId_etapaId_key" ON "ProyectoEtapaFecha"("tenantId", "proyectoId", "etapaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProyectoObligacion_tenantId_venceEl_idx" ON "ProyectoObligacion"("tenantId", "venceEl");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoObligacion_tenantId_envio_key" ON "ProyectoObligacion"("tenantId", "envio");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoCancelacion_proyectoId_tenantId_key" ON "ProyectoCancelacion"("proyectoId", "tenantId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoEtapaFecha_tenantId_fkey') THEN
    ALTER TABLE "ProyectoEtapaFecha" ADD CONSTRAINT "ProyectoEtapaFecha_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoEtapaFecha_proyectoId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoEtapaFecha" ADD CONSTRAINT "ProyectoEtapaFecha_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoObligacion_tenantId_fkey') THEN
    ALTER TABLE "ProyectoObligacion" ADD CONSTRAINT "ProyectoObligacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoObligacion_proyectoId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoObligacion" ADD CONSTRAINT "ProyectoObligacion_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoCancelacion_tenantId_fkey') THEN
    ALTER TABLE "ProyectoCancelacion" ADD CONSTRAINT "ProyectoCancelacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoCancelacion_proyectoId_tenantId_fkey') THEN
    ALTER TABLE "ProyectoCancelacion" ADD CONSTRAINT "ProyectoCancelacion_proyectoId_tenantId_fkey" FOREIGN KEY ("proyectoId", "tenantId") REFERENCES "Proyecto"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Aislamiento por negocio: política por tenant y RLS FORZADA (también para el dueño de las tablas) ──

ALTER TABLE "ProyectoEtapaFecha" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoEtapaFecha" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoEtapaFecha";
CREATE POLICY tenant_isolation ON "ProyectoEtapaFecha"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoObligacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoObligacion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoObligacion";
CREATE POLICY tenant_isolation ON "ProyectoObligacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoCancelacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoCancelacion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoCancelacion";
CREATE POLICY tenant_isolation ON "ProyectoCancelacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- El rol de la app (app_rls) hereda los permisos por defecto del esquema (prisma/rls/0002_app_role.sql); si existe, se
-- le dan explícitos por si los permisos por defecto no alcanzaran a tablas creadas por esta migración.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProyectoEtapaFecha", "ProyectoObligacion", "ProyectoCancelacion" TO app_rls;
  END IF;
END $$;
