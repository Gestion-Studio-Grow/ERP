-- GESTIÓN DE EVENTOS (MIA Producciones): las apps relevadas en docs/benchmark/heka-especificacion.md.
-- Aditiva: tablas nuevas con RLS y columnas con valor por defecto o nulas en tablas de este mismo módulo.
-- No toca ninguna tabla que usen los demás negocios.

-- AlterTable
ALTER TABLE "Proyecto" ADD COLUMN     "anticipoClientePct" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "carpetaUrl" TEXT,
ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "contactoEmail" TEXT,
ADD COLUMN     "contactoNombre" TEXT,
ADD COLUMN     "fechaFin" TIMESTAMP(3),
ADD COLUMN     "invitados" INTEGER,
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'ARS',
ADD COLUMN     "motivoPerdida" TEXT,
ADD COLUMN     "perdidoEl" TIMESTAMP(3),
ADD COLUMN     "presupuestoEstimado" DOUBLE PRECISION,
ADD COLUMN     "tipoEvento" TEXT,
ADD COLUMN     "tokenPortal" TEXT;

-- AlterTable
ALTER TABLE "ProyectoTarea" ADD COLUMN     "area" TEXT NOT NULL DEFAULT 'PRODUCCION',
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'POR_HACER',
ADD COLUMN     "personaId" TEXT;

-- AlterTable
ALTER TABLE "ProyectoPresupuesto" ADD COLUMN     "aprobadoInternoEl" TIMESTAMP(3),
ADD COLUMN     "aprobadoInternoPor" TEXT,
ADD COLUMN     "creadoPor" TEXT,
ADD COLUMN     "foto" JSONB,
ADD COLUMN     "nota" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ProyectoItem" ADD COLUMN     "costoReal" DOUBLE PRECISION,
ADD COLUMN     "estadoItem" TEXT NOT NULL DEFAULT 'PENDIENTE',
ADD COLUMN     "fechaLimite" TIMESTAMP(3),
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'ARS',
ADD COLUMN     "recargoPct" DOUBLE PRECISION,
ADD COLUMN     "supplierId" TEXT,
ADD COLUMN     "visibleCliente" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ProyectoArchivo" ADD COLUMN     "itemId" TEXT;

-- CreateTable
CREATE TABLE "ProyectoCuota" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT,
    "cuentaMovido" DOUBLE PRECISION,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT,
    "supplierId" TEXT,
    "tipo" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "venceEl" TIMESTAMP(3) NOT NULL,
    "pagadoEl" TIMESTAMP(3),
    "pagadoPor" TEXT,
    "medio" TEXT,
    "factura" TEXT,
    "comentario" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "clave" TEXT,
    "anuladoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoCuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoProveedorFicha" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rubro" TEXT,
    "ciudad" TEXT,
    "contacto" TEXT,
    "condiciones" TEXT NOT NULL DEFAULT '50% anticipo / 50% contra entrega',
    "anticipoPct" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "evaluacion" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "notas" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoProveedorFicha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoPersona" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "puesto" TEXT NOT NULL DEFAULT '',
    "rol" TEXT NOT NULL DEFAULT 'PRODUCCION',
    "sueldoBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "facturaA" TEXT NOT NULL DEFAULT '',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoEquipo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "funcion" TEXT NOT NULL DEFAULT '',
    "plus" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ProyectoEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoReunion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'REUNION',
    "fecha" TIMESTAMP(3) NOT NULL,
    "lugar" TEXT NOT NULL DEFAULT '',
    "creadaPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoReunion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoChecklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'general',
    "fecha" TIMESTAMP(3),
    "hechoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoMensaje" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'general',
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "adjuntoNombre" TEXT,
    "adjuntoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoComentarioImagen" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "resueltoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoComentarioImagen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoIdea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "concepto" TEXT NOT NULL DEFAULT '',
    "narrativa" TEXT NOT NULL DEFAULT '',
    "referencias" TEXT NOT NULL DEFAULT '',
    "materialidades" TEXT NOT NULL DEFAULT '',
    "informacion" TEXT NOT NULL DEFAULT '',
    "imagenes" JSONB,
    "moodboards" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoPresentacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL DEFAULT 'CLASICA',
    "laminas" JSONB NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "respuesta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoPresentacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoGastoFijo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'FIJO',
    "nombre" TEXT NOT NULL,
    "frecuencia" TEXT NOT NULL DEFAULT 'MENSUAL',
    "monto" DOUBLE PRECISION NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "fecha" TIMESTAMP(3),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoGastoFijo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoCuentaBanco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'ARS',
    "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoCuentaBanco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoMovBanco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "importe" DOUBLE PRECISION NOT NULL,
    "lote" TEXT NOT NULL DEFAULT '',
    "cuotaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoMovBanco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoTipoCambio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moneda" TEXT NOT NULL,
    "porUnidad" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProyectoTipoCambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoLiquidacion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "base" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extras" JSONB,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "facturaA" TEXT NOT NULL DEFAULT '',
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "publicadaEl" TIMESTAMP(3),
    "vistaEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoLiquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoAviso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "enlace" TEXT,
    "leidoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoAviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoAvisoPref" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "enSistema" BOOLEAN NOT NULL DEFAULT true,
    "porMail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProyectoAvisoPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoPermiso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "ver" BOOLEAN NOT NULL DEFAULT false,
    "editar" BOOLEAN NOT NULL DEFAULT false,
    "columnasOcultas" JSONB,

    CONSTRAINT "ProyectoPermiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProyectoCambio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proyectoId" TEXT,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "campo" TEXT NOT NULL,
    "antes" TEXT,
    "despues" TEXT,
    "autor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoCambio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProyectoCuota_tenantId_proyectoId_idx" ON "ProyectoCuota"("tenantId", "proyectoId");

-- CreateIndex
CREATE INDEX "ProyectoCuota_tenantId_tipo_venceEl_idx" ON "ProyectoCuota"("tenantId", "tipo", "venceEl");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoCuota_tenantId_clave_key" ON "ProyectoCuota"("tenantId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoProveedorFicha_supplierId_key" ON "ProyectoProveedorFicha"("supplierId");

-- CreateIndex
CREATE INDEX "ProyectoProveedorFicha_tenantId_idx" ON "ProyectoProveedorFicha"("tenantId");

-- CreateIndex
CREATE INDEX "ProyectoPersona_tenantId_idx" ON "ProyectoPersona"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoPersona_tenantId_userId_key" ON "ProyectoPersona"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "ProyectoEquipo_tenantId_personaId_idx" ON "ProyectoEquipo"("tenantId", "personaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoEquipo_proyectoId_personaId_key" ON "ProyectoEquipo"("proyectoId", "personaId");

-- CreateIndex
CREATE INDEX "ProyectoReunion_tenantId_fecha_idx" ON "ProyectoReunion"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "ProyectoChecklist_tenantId_proyectoId_idx" ON "ProyectoChecklist"("tenantId", "proyectoId");

-- CreateIndex
CREATE INDEX "ProyectoMensaje_tenantId_proyectoId_createdAt_idx" ON "ProyectoMensaje"("tenantId", "proyectoId", "createdAt");

-- CreateIndex
CREATE INDEX "ProyectoComentarioImagen_tenantId_versionId_idx" ON "ProyectoComentarioImagen"("tenantId", "versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoIdea_proyectoId_key" ON "ProyectoIdea"("proyectoId");

-- CreateIndex
CREATE INDEX "ProyectoIdea_tenantId_idx" ON "ProyectoIdea"("tenantId");

-- CreateIndex
CREATE INDEX "ProyectoPresentacion_tenantId_proyectoId_idx" ON "ProyectoPresentacion"("tenantId", "proyectoId");

-- CreateIndex
CREATE INDEX "ProyectoGastoFijo_tenantId_idx" ON "ProyectoGastoFijo"("tenantId");

-- CreateIndex
CREATE INDEX "ProyectoCuentaBanco_tenantId_idx" ON "ProyectoCuentaBanco"("tenantId");

-- CreateIndex
CREATE INDEX "ProyectoMovBanco_tenantId_cuentaId_fecha_idx" ON "ProyectoMovBanco"("tenantId", "cuentaId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoTipoCambio_tenantId_moneda_key" ON "ProyectoTipoCambio"("tenantId", "moneda");

-- CreateIndex
CREATE INDEX "ProyectoLiquidacion_tenantId_periodo_idx" ON "ProyectoLiquidacion"("tenantId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoLiquidacion_tenantId_personaId_periodo_key" ON "ProyectoLiquidacion"("tenantId", "personaId", "periodo");

-- CreateIndex
CREATE INDEX "ProyectoAviso_tenantId_destinatario_leidoEl_idx" ON "ProyectoAviso"("tenantId", "destinatario", "leidoEl");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoAvisoPref_tenantId_userId_tipo_key" ON "ProyectoAvisoPref"("tenantId", "userId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ProyectoPermiso_tenantId_rol_modulo_key" ON "ProyectoPermiso"("tenantId", "rol", "modulo");

-- CreateIndex
CREATE INDEX "ProyectoCambio_tenantId_proyectoId_createdAt_idx" ON "ProyectoCambio"("tenantId", "proyectoId", "createdAt");

-- CreateIndex
CREATE INDEX "ProyectoCambio_tenantId_createdAt_idx" ON "ProyectoCambio"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Proyecto_tokenPortal_key" ON "Proyecto"("tokenPortal");

-- AddForeignKey
ALTER TABLE "ProyectoItem" ADD CONSTRAINT "ProyectoItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuota" ADD CONSTRAINT "ProyectoCuota_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuota" ADD CONSTRAINT "ProyectoCuota_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuota" ADD CONSTRAINT "ProyectoCuota_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoProveedorFicha" ADD CONSTRAINT "ProyectoProveedorFicha_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoProveedorFicha" ADD CONSTRAINT "ProyectoProveedorFicha_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoPersona" ADD CONSTRAINT "ProyectoPersona_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoEquipo" ADD CONSTRAINT "ProyectoEquipo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoEquipo" ADD CONSTRAINT "ProyectoEquipo_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoEquipo" ADD CONSTRAINT "ProyectoEquipo_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ProyectoPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoReunion" ADD CONSTRAINT "ProyectoReunion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoReunion" ADD CONSTRAINT "ProyectoReunion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoChecklist" ADD CONSTRAINT "ProyectoChecklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoChecklist" ADD CONSTRAINT "ProyectoChecklist_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMensaje" ADD CONSTRAINT "ProyectoMensaje_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMensaje" ADD CONSTRAINT "ProyectoMensaje_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComentarioImagen" ADD CONSTRAINT "ProyectoComentarioImagen_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoComentarioImagen" ADD CONSTRAINT "ProyectoComentarioImagen_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProyectoEntregableVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoIdea" ADD CONSTRAINT "ProyectoIdea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoIdea" ADD CONSTRAINT "ProyectoIdea_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoPresentacion" ADD CONSTRAINT "ProyectoPresentacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoPresentacion" ADD CONSTRAINT "ProyectoPresentacion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoGastoFijo" ADD CONSTRAINT "ProyectoGastoFijo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCuentaBanco" ADD CONSTRAINT "ProyectoCuentaBanco_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMovBanco" ADD CONSTRAINT "ProyectoMovBanco_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMovBanco" ADD CONSTRAINT "ProyectoMovBanco_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "ProyectoCuentaBanco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoMovBanco" ADD CONSTRAINT "ProyectoMovBanco_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "ProyectoCuota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoTipoCambio" ADD CONSTRAINT "ProyectoTipoCambio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoLiquidacion" ADD CONSTRAINT "ProyectoLiquidacion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoLiquidacion" ADD CONSTRAINT "ProyectoLiquidacion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "ProyectoPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoAviso" ADD CONSTRAINT "ProyectoAviso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoAvisoPref" ADD CONSTRAINT "ProyectoAvisoPref_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoPermiso" ADD CONSTRAINT "ProyectoPermiso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProyectoCambio" ADD CONSTRAINT "ProyectoCambio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoCuota" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoCuota";
CREATE POLICY tenant_isolation ON "ProyectoCuota"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoProveedorFicha" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoProveedorFicha";
CREATE POLICY tenant_isolation ON "ProyectoProveedorFicha"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoPersona" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoPersona";
CREATE POLICY tenant_isolation ON "ProyectoPersona"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoEquipo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoEquipo";
CREATE POLICY tenant_isolation ON "ProyectoEquipo"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoReunion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoReunion";
CREATE POLICY tenant_isolation ON "ProyectoReunion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoChecklist" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoChecklist";
CREATE POLICY tenant_isolation ON "ProyectoChecklist"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoMensaje" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoMensaje";
CREATE POLICY tenant_isolation ON "ProyectoMensaje"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoComentarioImagen" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoComentarioImagen";
CREATE POLICY tenant_isolation ON "ProyectoComentarioImagen"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoIdea" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoIdea";
CREATE POLICY tenant_isolation ON "ProyectoIdea"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoPresentacion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoPresentacion";
CREATE POLICY tenant_isolation ON "ProyectoPresentacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoGastoFijo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoGastoFijo";
CREATE POLICY tenant_isolation ON "ProyectoGastoFijo"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoCuentaBanco" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoCuentaBanco";
CREATE POLICY tenant_isolation ON "ProyectoCuentaBanco"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoMovBanco" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoMovBanco";
CREATE POLICY tenant_isolation ON "ProyectoMovBanco"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoTipoCambio" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoTipoCambio";
CREATE POLICY tenant_isolation ON "ProyectoTipoCambio"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoLiquidacion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoLiquidacion";
CREATE POLICY tenant_isolation ON "ProyectoLiquidacion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoAviso" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoAviso";
CREATE POLICY tenant_isolation ON "ProyectoAviso"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoAvisoPref" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoAvisoPref";
CREATE POLICY tenant_isolation ON "ProyectoAvisoPref"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoPermiso" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoPermiso";
CREATE POLICY tenant_isolation ON "ProyectoPermiso"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoCambio" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoCambio";
CREATE POLICY tenant_isolation ON "ProyectoCambio"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
