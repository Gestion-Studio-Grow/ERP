-- Módulo PROYECTOS: trabajos por etapas, tareas, presupuesto por versiones, cobros, archivos y
-- stands del armador 3D. Aditiva: tablas nuevas y una columna nullable en "CashMovement" (la clave
-- del asiento de cada cobro). No toca datos de ningún negocio existente.

CREATE TABLE "Proyecto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "clientId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "servicio" TEXT NOT NULL,
  "etapa" TEXT NOT NULL DEFAULT 'PEDIDO',
  "evento" TEXT,
  "lugar" TEXT,
  "fechaArmado" TIMESTAMP(3),
  "fechaEvento" TIMESTAMP(3),
  "fechaDesarme" TIMESTAMP(3),
  "responsable" TEXT,
  "brief" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Proyecto_tenantId_numero_key" ON "Proyecto"("tenantId", "numero");
CREATE INDEX "Proyecto_tenantId_etapa_idx" ON "Proyecto"("tenantId", "etapa");
CREATE INDEX "Proyecto_tenantId_clientId_idx" ON "Proyecto"("tenantId", "clientId");

CREATE TABLE "ProyectoTarea" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "responsable" TEXT,
  "venceEl" TIMESTAMP(3),
  "hechaEl" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoTarea_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoTarea_tenantId_proyectoId_idx" ON "ProyectoTarea"("tenantId", "proyectoId");

CREATE TABLE "ProyectoPresupuesto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
  "token" TEXT NOT NULL,
  "ivaPct" DOUBLE PRECISION NOT NULL DEFAULT 21,
  "presentacion" TEXT NOT NULL DEFAULT '',
  "condiciones" TEXT NOT NULL DEFAULT '',
  "enviadoEl" TIMESTAMP(3),
  "validoHasta" TIMESTAMP(3),
  "respondidoEl" TIMESTAMP(3),
  "respondidoPor" TEXT,
  "motivoRechazo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProyectoPresupuesto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProyectoPresupuesto_token_key" ON "ProyectoPresupuesto"("token");
CREATE UNIQUE INDEX "ProyectoPresupuesto_tenantId_proyectoId_version_key" ON "ProyectoPresupuesto"("tenantId", "proyectoId", "version");

CREATE TABLE "ProyectoItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "presupuestoId" TEXT NOT NULL,
  "rubro" TEXT NOT NULL,
  "descripcion" TEXT NOT NULL,
  "unidad" TEXT NOT NULL DEFAULT 'u',
  "cantidad" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "costo" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "proveedor" TEXT,
  "origen" TEXT,
  "posicion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoItem_tenantId_presupuestoId_idx" ON "ProyectoItem"("tenantId", "presupuestoId");

CREATE TABLE "ProyectoPago" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "medio" TEXT NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "nota" TEXT,
  "cobradoPor" TEXT,
  "anuladoEl" TIMESTAMP(3),
  "anuladoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoPago_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoPago_tenantId_proyectoId_idx" ON "ProyectoPago"("tenantId", "proyectoId");

CREATE TABLE "ProyectoArchivo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'RENDER',
  "nombre" TEXT NOT NULL,
  "datos" TEXT,
  "url" TEXT,
  "visibleCliente" BOOLEAN NOT NULL DEFAULT false,
  "subidoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoArchivo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoArchivo_tenantId_proyectoId_idx" ON "ProyectoArchivo"("tenantId", "proyectoId");

CREATE TABLE "ProyectoStand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL DEFAULT 'Stand',
  "diseno" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProyectoStand_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoStand_tenantId_proyectoId_idx" ON "ProyectoStand"("tenantId", "proyectoId");

CREATE TABLE "ProyectoConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "margenPct" DOUBLE PRECISION NOT NULL DEFAULT 35,
  "validezDias" INTEGER NOT NULL DEFAULT 15,
  "ivaPct" DOUBLE PRECISION NOT NULL DEFAULT 21,
  "condiciones" TEXT NOT NULL DEFAULT '',
  "costosStand" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProyectoConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProyectoConfig_tenantId_key" ON "ProyectoConfig"("tenantId");

ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Proyecto" ADD CONSTRAINT "Proyecto_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoTarea" ADD CONSTRAINT "ProyectoTarea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoTarea" ADD CONSTRAINT "ProyectoTarea_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProyectoPresupuesto" ADD CONSTRAINT "ProyectoPresupuesto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoPresupuesto" ADD CONSTRAINT "ProyectoPresupuesto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProyectoItem" ADD CONSTRAINT "ProyectoItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoItem" ADD CONSTRAINT "ProyectoItem_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "ProyectoPresupuesto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProyectoPago" ADD CONSTRAINT "ProyectoPago_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoPago" ADD CONSTRAINT "ProyectoPago_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoArchivo" ADD CONSTRAINT "ProyectoArchivo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoArchivo" ADD CONSTRAINT "ProyectoArchivo_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProyectoStand" ADD CONSTRAINT "ProyectoStand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoStand" ADD CONSTRAINT "ProyectoStand_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProyectoConfig" ADD CONSTRAINT "ProyectoConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashMovement" ADD COLUMN "proyectoPagoId" TEXT;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoPagoId_fkey"
  FOREIGN KEY ("proyectoPagoId") REFERENCES "ProyectoPago"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CashMovement_tenantId_proyectoPagoId_type_key" ON "CashMovement"("tenantId", "proyectoPagoId", "type");

-- ── RLS de las tablas nuevas (misma política que prisma/rls/0001_enable_rls.sql) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'Proyecto', 'ProyectoTarea', 'ProyectoPresupuesto', 'ProyectoItem', 'ProyectoPago',
    'ProyectoArchivo', 'ProyectoStand', 'ProyectoConfig'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
      || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      t
    );
  END LOOP;
END $$;
