-- Eventos y sponsors (GSG-CRM-009 · pedido de MIA Producciones, 14/11/2026): el CRM que lleva el equipo de
-- agentes. Los eventos de una región, las marcas que van a cada uno con la URL de la fuente, el registro de
-- qué puesto del equipo hizo qué y los pedidos del negocio al equipo. Sólo hechos públicos de empresas:
-- ningún dato de contacto de personas.
-- ADITIVA: cinco tablas nuevas con RLS. No toca tablas, datos ni enums existentes.
-- SIN APLICAR (Gate 2): el código la tolera ausente (la pantalla dice «falta un paso de base de datos»).
-- Vuelta atrás: DROP de las cinco tablas (EventoMarca primero).

-- CreateTable
CREATE TABLE "EventoRelevado" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "fechaHasta" DATE,
    "lugar" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "organizador" TEXT,
    "urlFuente" TEXT,
    "tipo" TEXT,
    "verificacion" TEXT NOT NULL DEFAULT 'sin verificar',
    "origen" TEXT NOT NULL DEFAULT 'IMPORTACION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventoRelevado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarcaRelevada" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rubro" TEXT,
    "web" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarcaRelevada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoMarca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "marcaId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "nivel" TEXT,
    "urlFuente" TEXT NOT NULL,
    "edicion" TEXT,
    "verificacion" TEXT NOT NULL DEFAULT 'sin verificar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoMarca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccionDelEquipo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "puesto" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "hora" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "detalle" TEXT,
    "eventoClave" TEXT NOT NULL,
    "marcaClave" TEXT,
    "rol" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccionDelEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoAlEquipo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "puesto" TEXT NOT NULL DEFAULT 'descubridor',
    "pedido" TEXT NOT NULL,
    "region" TEXT,
    "desde" DATE,
    "hasta" DATE,
    "estado" TEXT NOT NULL DEFAULT 'EN_COLA',
    "creadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoAlEquipo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoRelevado_tenantId_region_fecha_idx" ON "EventoRelevado"("tenantId", "region", "fecha");

-- CreateIndex
CREATE INDEX "EventoRelevado_tenantId_fecha_idx" ON "EventoRelevado"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "EventoRelevado_tenantId_clave_key" ON "EventoRelevado"("tenantId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "EventoRelevado_id_tenantId_key" ON "EventoRelevado"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MarcaRelevada_tenantId_clave_key" ON "MarcaRelevada"("tenantId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "MarcaRelevada_id_tenantId_key" ON "MarcaRelevada"("id", "tenantId");

-- CreateIndex
CREATE INDEX "EventoMarca_tenantId_marcaId_idx" ON "EventoMarca"("tenantId", "marcaId");

-- CreateIndex
CREATE UNIQUE INDEX "EventoMarca_tenantId_eventoId_marcaId_rol_key" ON "EventoMarca"("tenantId", "eventoId", "marcaId", "rol");

-- CreateIndex
CREATE INDEX "AccionDelEquipo_tenantId_eventoClave_idx" ON "AccionDelEquipo"("tenantId", "eventoClave");

-- CreateIndex
CREATE INDEX "AccionDelEquipo_tenantId_puesto_hora_idx" ON "AccionDelEquipo"("tenantId", "puesto", "hora");

-- CreateIndex
CREATE UNIQUE INDEX "AccionDelEquipo_tenantId_clave_key" ON "AccionDelEquipo"("tenantId", "clave");

-- CreateIndex
CREATE INDEX "PedidoAlEquipo_tenantId_estado_createdAt_idx" ON "PedidoAlEquipo"("tenantId", "estado", "createdAt");

-- AddForeignKey
ALTER TABLE "EventoRelevado" ADD CONSTRAINT "EventoRelevado_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarcaRelevada" ADD CONSTRAINT "MarcaRelevada_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoMarca" ADD CONSTRAINT "EventoMarca_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoMarca" ADD CONSTRAINT "EventoMarca_eventoId_tenantId_fkey" FOREIGN KEY ("eventoId", "tenantId") REFERENCES "EventoRelevado"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoMarca" ADD CONSTRAINT "EventoMarca_marcaId_tenantId_fkey" FOREIGN KEY ("marcaId", "tenantId") REFERENCES "MarcaRelevada"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccionDelEquipo" ADD CONSTRAINT "AccionDelEquipo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoAlEquipo" ADD CONSTRAINT "PedidoAlEquipo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valores cerrados (TEXT + CHECK: un enum en Neon es irreversible).
ALTER TABLE "EventoRelevado" ADD CONSTRAINT "EventoRelevado_origen_check" CHECK ("origen" IN ('IMPORTACION', 'MANUAL'));
ALTER TABLE "EventoRelevado" ADD CONSTRAINT "EventoRelevado_fechas_check" CHECK ("fechaHasta" IS NULL OR "fechaHasta" >= "fecha");
ALTER TABLE "EventoRelevado" ADD CONSTRAINT "EventoRelevado_textos_check" CHECK (length(btrim("nombre")) > 0 AND length(btrim("lugar")) > 0 AND length(btrim("region")) > 0 AND length(btrim("clave")) > 0);
ALTER TABLE "EventoRelevado" ADD CONSTRAINT "EventoRelevado_urlFuente_check" CHECK ("urlFuente" IS NULL OR "urlFuente" ~* '^https?://');
ALTER TABLE "EventoRelevado" ADD CONSTRAINT "EventoRelevado_verificacion_check" CHECK ("verificacion" IN ('confirmado', 'en duda', 'falla', 'sin verificar'));
ALTER TABLE "MarcaRelevada" ADD CONSTRAINT "MarcaRelevada_textos_check" CHECK (length(btrim("nombre")) > 0 AND length(btrim("clave")) > 0);
ALTER TABLE "MarcaRelevada" ADD CONSTRAINT "MarcaRelevada_web_check" CHECK ("web" IS NULL OR "web" ~* '^https?://');
ALTER TABLE "EventoMarca" ADD CONSTRAINT "EventoMarca_rol_check" CHECK ("rol" IN ('SPONSOR_PRINCIPAL', 'SPONSOR', 'AUSPICIANTE', 'MEDIA_PARTNER', 'EXPOSITOR', 'ORGANIZADOR', 'OTRO'));
ALTER TABLE "EventoMarca" ADD CONSTRAINT "EventoMarca_urlFuente_check" CHECK ("urlFuente" ~* '^https?://');
ALTER TABLE "EventoMarca" ADD CONSTRAINT "EventoMarca_verificacion_check" CHECK ("verificacion" IN ('confirmado', 'en duda', 'falla', 'sin verificar'));
ALTER TABLE "AccionDelEquipo" ADD CONSTRAINT "AccionDelEquipo_puesto_check" CHECK ("puesto" IN ('descubridor', 'identificador', 'verificador', 'contactos', 'redactor', 'seguidor'));
ALTER TABLE "AccionDelEquipo" ADD CONSTRAINT "AccionDelEquipo_textos_check" CHECK (length(btrim("accion")) > 0 AND length(btrim("clave")) > 0 AND length(btrim("eventoClave")) > 0);
ALTER TABLE "AccionDelEquipo" ADD CONSTRAINT "AccionDelEquipo_url_check" CHECK ("url" IS NULL OR "url" ~* '^https?://');
ALTER TABLE "PedidoAlEquipo" ADD CONSTRAINT "PedidoAlEquipo_puesto_check" CHECK ("puesto" IN ('descubridor', 'identificador', 'verificador'));
ALTER TABLE "PedidoAlEquipo" ADD CONSTRAINT "PedidoAlEquipo_estado_check" CHECK ("estado" IN ('EN_COLA', 'EN_CURSO', 'HECHO', 'DESCARTADO'));
ALTER TABLE "PedidoAlEquipo" ADD CONSTRAINT "PedidoAlEquipo_pedido_check" CHECK (length(btrim("pedido")) > 0 AND length("pedido") <= 500);
ALTER TABLE "PedidoAlEquipo" ADD CONSTRAINT "PedidoAlEquipo_region_check" CHECK ("region" IS NULL OR (length(btrim("region")) > 0 AND length("region") <= 80));
ALTER TABLE "PedidoAlEquipo" ADD CONSTRAINT "PedidoAlEquipo_fechas_check" CHECK ("desde" IS NULL OR "hasta" IS NULL OR "hasta" >= "desde");

-- RLS: aislamiento por negocio (mismo molde que 20261105122000_vouchers).
ALTER TABLE "EventoRelevado" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EventoRelevado";
CREATE POLICY tenant_isolation ON "EventoRelevado"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "MarcaRelevada" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MarcaRelevada";
CREATE POLICY tenant_isolation ON "MarcaRelevada"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "EventoMarca" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EventoMarca";
CREATE POLICY tenant_isolation ON "EventoMarca"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AccionDelEquipo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AccionDelEquipo";
CREATE POLICY tenant_isolation ON "AccionDelEquipo"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PedidoAlEquipo" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PedidoAlEquipo";
CREATE POLICY tenant_isolation ON "PedidoAlEquipo"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
