-- Consola de la Cuadrilla (GSG-MIA-062 · 17/11/2026): los agentes de un negocio (sesiones de Claude Code que
-- operan el sistema por el navegador con su usuario propio), sus excepciones (aprobaciones, frenos, rechazos,
-- escalados) y los hilos por agente o por equipo donde las personas les hablan. El ERP no llama a ningún modelo.
-- ADITIVA: tres tablas nuevas con RLS. No toca tablas, datos ni enums existentes.
-- SIN APLICAR (Gate 2 del dueño): el código la tolera ausente (la pantalla dice «falta un paso de base de datos»).
-- Vuelta atrás: DROP de las tres tablas (ExcepcionCuadrilla primero).
-- CreateTable
CREATE TABLE "AgenteCuadrilla" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "equipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "userId" TEXT,
    "sesion" TEXT,
    "ultimaSenal" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgenteCuadrilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcepcionCuadrilla" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agenteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'OTRA',
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "creadaPorUserId" TEXT,
    "decididaPor" TEXT,
    "decididaEn" TIMESTAMP(3),
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExcepcionCuadrilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeCuadrilla" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hilo" TEXT NOT NULL,
    "autorTipo" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "autorUserId" TEXT,
    "agenteId" TEXT,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeCuadrilla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgenteCuadrilla_tenantId_estado_idx" ON "AgenteCuadrilla"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "AgenteCuadrilla_tenantId_nombre_key" ON "AgenteCuadrilla"("tenantId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "AgenteCuadrilla_tenantId_userId_key" ON "AgenteCuadrilla"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgenteCuadrilla_id_tenantId_key" ON "AgenteCuadrilla"("id", "tenantId");

-- CreateIndex
CREATE INDEX "ExcepcionCuadrilla_tenantId_estado_createdAt_idx" ON "ExcepcionCuadrilla"("tenantId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "ExcepcionCuadrilla_tenantId_agenteId_idx" ON "ExcepcionCuadrilla"("tenantId", "agenteId");

-- CreateIndex
CREATE INDEX "MensajeCuadrilla_tenantId_hilo_createdAt_idx" ON "MensajeCuadrilla"("tenantId", "hilo", "createdAt");

-- AddForeignKey
ALTER TABLE "AgenteCuadrilla" ADD CONSTRAINT "AgenteCuadrilla_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_agenteId_tenantId_fkey" FOREIGN KEY ("agenteId", "tenantId") REFERENCES "AgenteCuadrilla"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeCuadrilla" ADD CONSTRAINT "MensajeCuadrilla_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Valores cerrados (TEXT + CHECK: un enum en Neon es irreversible).
ALTER TABLE "AgenteCuadrilla" ADD CONSTRAINT "AgenteCuadrilla_estado_check" CHECK ("estado" IN ('ACTIVO', 'PAUSADO', 'FRENADO'));
ALTER TABLE "AgenteCuadrilla" ADD CONSTRAINT "AgenteCuadrilla_textos_check" CHECK (length(btrim("nombre")) > 0 AND length("nombre") <= 60 AND length(btrim("puesto")) > 0 AND length(btrim("equipo")) > 0);
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_tipo_check" CHECK ("tipo" IN ('APROBACION', 'FRENADO', 'RECHAZO', 'ESCALADO'));
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_categoria_check" CHECK ("categoria" IN ('PLATA', 'ENVIO_TERCEROS', 'OTRA'));
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_estado_check" CHECK ("estado" IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'RESUELTA'));
ALTER TABLE "ExcepcionCuadrilla" ADD CONSTRAINT "ExcepcionCuadrilla_textos_check" CHECK (length(btrim("titulo")) > 0 AND length("titulo") <= 160 AND length(btrim("contenido")) > 0 AND length("contenido") <= 4000);
ALTER TABLE "MensajeCuadrilla" ADD CONSTRAINT "MensajeCuadrilla_autorTipo_check" CHECK ("autorTipo" IN ('PERSONA', 'AGENTE', 'SISTEMA'));
ALTER TABLE "MensajeCuadrilla" ADD CONSTRAINT "MensajeCuadrilla_hilo_check" CHECK ("hilo" ~ '^(agente|equipo):.+');
ALTER TABLE "MensajeCuadrilla" ADD CONSTRAINT "MensajeCuadrilla_texto_check" CHECK (length(btrim("texto")) > 0 AND length("texto") <= 2000);

-- RLS: aislamiento por negocio (mismo molde que 20261114231500_eventos_y_sponsors).
ALTER TABLE "AgenteCuadrilla" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AgenteCuadrilla";
CREATE POLICY tenant_isolation ON "AgenteCuadrilla"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ExcepcionCuadrilla" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ExcepcionCuadrilla";
CREATE POLICY tenant_isolation ON "ExcepcionCuadrilla"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "MensajeCuadrilla" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MensajeCuadrilla";
CREATE POLICY tenant_isolation ON "MensajeCuadrilla"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

