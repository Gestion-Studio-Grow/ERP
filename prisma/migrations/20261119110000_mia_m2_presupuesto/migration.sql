-- M2 · MIA T06 (GSG-MIA-125): presupuesto con una sola base aprobada, adicionales, líneas con sector, categoría y
-- personal, y previsión de pagos con los dos estados de Administración.
-- ADITIVA: crea 4 tablas nuevas (con tenantId, RLS forzada y la política por negocio) y UN índice único parcial sobre
-- ProyectoPresupuesto. No agrega columnas a tablas existentes, no cambia tipos, no borra ni mueve datos.
-- Plata nueva en centavos enteros (BIGINT): ProyectoAdicionalLinea.costoCentavos y precioCentavos.
-- Se puede correr dos veces (IF NOT EXISTS, DROP POLICY IF EXISTS): la segunda corrida no cambia nada.
-- Sin estas tablas el código lee como antes (presupuesto-m2.server.ts: `hayM2`), y la base aprobada la sigue cuidando
-- la acción. Aplicarla en Neon es Gate 2 del dueño. Vuelta atrás: rollback.sql en esta carpeta.
--
-- ANTES DEL ÍNDICE: si algún proyecto tiene dos versiones APROBADAS, la migración frena con el conteo y no aplica nada
-- (la transacción entera vuelve atrás). Esos casos se resuelven a mano primero (Dis. § 6). El conteo solo, sin aplicar:
-- scripts/proyectos/m2-conteo-dos-aprobadas.sql.
DO $$
DECLARE
  proyectos_con_dos INTEGER;
BEGIN
  SELECT COUNT(*) INTO proyectos_con_dos FROM (
    SELECT "tenantId", "proyectoId" FROM "ProyectoPresupuesto" WHERE "estado" = 'APROBADO'
    GROUP BY "tenantId", "proyectoId" HAVING COUNT(*) > 1
  ) dobles;
  IF proyectos_con_dos > 0 THEN
    RAISE EXCEPTION 'M2 frenada: % proyecto(s) con dos o más versiones APROBADAS. Resolverlos antes de aplicar (scripts/proyectos/m2-conteo-dos-aprobadas.sql).', proyectos_con_dos;
  END IF;
END $$;

-- Una sola versión base aprobada por proyecto, garantizada por la base. Toda fila de ProyectoPresupuesto es una versión
-- BASE: los adicionales viven en su propia tabla (ProyectoAdicional), así el índice no los alcanza.
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoPresupuesto_una_base_aprobada" ON "ProyectoPresupuesto"("tenantId", "proyectoId") WHERE "estado" = 'APROBADO';

-- CreateTable: lo que la línea del presupuesto base tiene y el ítem no (1 a 1 con el ítem).
CREATE TABLE IF NOT EXISTS "ProyectoLineaDetalle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sector" TEXT,
    "categoria" TEXT,
    "puestos" INTEGER,
    "horas" DOUBLE PRECISION,
    "dias" INTEGER,
    "anticipoPct" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoLineaDetalle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProyectoLineaDetalle_anticipoPct_check" CHECK ("anticipoPct" IS NULL OR ("anticipoPct" >= 0 AND "anticipoPct" <= 100))
);

-- CreateTable: un adicional es un presupuesto aparte, con sus líneas y sus dos aprobaciones.
CREATE TABLE IF NOT EXISTS "ProyectoAdicional" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "ivaPct" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "creadoPor" TEXT NOT NULL,
    "aprobadoInternoPor" TEXT,
    "aprobadoInternoPorId" TEXT,
    "aprobadoInternoEl" TIMESTAMP(3),
    "enviadoEl" TIMESTAMP(3),
    "respondidoEl" TIMESTAMP(3),
    "respondidoPor" TEXT,
    "motivoRechazo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoAdicional_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProyectoAdicional_estado_check" CHECK ("estado" IN ('BORRADOR', 'ENVIADO', 'APROBADO', 'RECHAZADO'))
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProyectoAdicionalLinea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adicionalId" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "supplierId" TEXT,
    "proveedor" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "puestos" INTEGER,
    "horas" DOUBLE PRECISION,
    "dias" INTEGER,
    "costoCentavos" BIGINT NOT NULL DEFAULT 0,
    "precioCentavos" BIGINT NOT NULL DEFAULT 0,
    "anticipoPct" DOUBLE PRECISION,
    "posicion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoAdicionalLinea_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProyectoAdicionalLinea_plata_check" CHECK ("costoCentavos" >= 0 AND "precioCentavos" >= 0),
    CONSTRAINT "ProyectoAdicionalLinea_anticipoPct_check" CHECK ("anticipoPct" IS NULL OR ("anticipoPct" >= 0 AND "anticipoPct" <= 100))
);

-- CreateTable: el estado que marca Administración en cada cuota de pago de la previsión. Sin fila: el primer estado.
CREATE TABLE IF NOT EXISTS "ProyectoPrevisionEstado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "confirmado" BOOLEAN NOT NULL DEFAULT false,
    "marcadoPor" TEXT NOT NULL,
    "marcadoNombre" TEXT NOT NULL,
    "marcadoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoPrevisionEstado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoLineaDetalle_itemId_key" ON "ProyectoLineaDetalle"("itemId");
CREATE INDEX IF NOT EXISTS "ProyectoLineaDetalle_tenantId_idx" ON "ProyectoLineaDetalle"("tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoAdicional_tenantId_proyectoId_numero_key" ON "ProyectoAdicional"("tenantId", "proyectoId", "numero");
CREATE INDEX IF NOT EXISTS "ProyectoAdicional_tenantId_proyectoId_idx" ON "ProyectoAdicional"("tenantId", "proyectoId");
CREATE INDEX IF NOT EXISTS "ProyectoAdicionalLinea_tenantId_adicionalId_idx" ON "ProyectoAdicionalLinea"("tenantId", "adicionalId");
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoPrevisionEstado_cuotaId_key" ON "ProyectoPrevisionEstado"("cuotaId");
CREATE INDEX IF NOT EXISTS "ProyectoPrevisionEstado_tenantId_idx" ON "ProyectoPrevisionEstado"("tenantId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLineaDetalle_tenantId_fkey') THEN
    ALTER TABLE "ProyectoLineaDetalle" ADD CONSTRAINT "ProyectoLineaDetalle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoLineaDetalle_itemId_fkey') THEN
    ALTER TABLE "ProyectoLineaDetalle" ADD CONSTRAINT "ProyectoLineaDetalle_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProyectoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoAdicional_tenantId_fkey') THEN
    ALTER TABLE "ProyectoAdicional" ADD CONSTRAINT "ProyectoAdicional_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoAdicional_proyectoId_fkey') THEN
    ALTER TABLE "ProyectoAdicional" ADD CONSTRAINT "ProyectoAdicional_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoAdicionalLinea_tenantId_fkey') THEN
    ALTER TABLE "ProyectoAdicionalLinea" ADD CONSTRAINT "ProyectoAdicionalLinea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoAdicionalLinea_adicionalId_fkey') THEN
    ALTER TABLE "ProyectoAdicionalLinea" ADD CONSTRAINT "ProyectoAdicionalLinea_adicionalId_fkey" FOREIGN KEY ("adicionalId") REFERENCES "ProyectoAdicional"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoPrevisionEstado_tenantId_fkey') THEN
    ALTER TABLE "ProyectoPrevisionEstado" ADD CONSTRAINT "ProyectoPrevisionEstado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProyectoPrevisionEstado_cuotaId_fkey') THEN
    ALTER TABLE "ProyectoPrevisionEstado" ADD CONSTRAINT "ProyectoPrevisionEstado_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "ProyectoCuota"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Aislamiento por negocio: política por tenant y RLS FORZADA (también para el dueño de las tablas) ──

ALTER TABLE "ProyectoLineaDetalle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoLineaDetalle" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoLineaDetalle";
CREATE POLICY tenant_isolation ON "ProyectoLineaDetalle"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoAdicional" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoAdicional" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoAdicional";
CREATE POLICY tenant_isolation ON "ProyectoAdicional"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoAdicionalLinea" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoAdicionalLinea" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoAdicionalLinea";
CREATE POLICY tenant_isolation ON "ProyectoAdicionalLinea"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoPrevisionEstado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProyectoPrevisionEstado" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoPrevisionEstado";
CREATE POLICY tenant_isolation ON "ProyectoPrevisionEstado"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "ProyectoLineaDetalle", "ProyectoAdicional", "ProyectoAdicionalLinea", "ProyectoPrevisionEstado" TO app_rls;
  END IF;
END $$;
