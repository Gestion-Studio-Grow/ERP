-- =============================================================================
-- PASE A PRODUCCIÓN — el lote vigente de prisma/lote-deploy.txt (hoy: 4 migraciones,
-- 20261101120000_modulo_proyectos, 20261101130000_proyecto_gastos, 20261101140000_proyecto_entregables y 20261101150000_proyecto_gestion_eventos). Se pega en
-- PRODUCCIÓN, DESPUÉS de crear un branch de respaldo con la fecha del día
-- (Branches → Create branch → "respaldo-AAAA-MM-DD"). Gate 2: sólo con OK del dueño.
-- =============================================================================
-- Mismo SQL que el ensayo (docs/runbooks/ensayo-neon/1-lote-en-branch.sql): aplica el lote en
-- UNA transacción, lo registra en _prisma_migrations con el checksum de Prisma y frena si ya
-- estaba. Si algo falla no queda nada a medias y el error dice cuál.
-- El pase del 23/09 (las 4 migraciones de caja) quedó en el historial de git de este archivo
-- y en respaldo-2026-09-23.md.
--
-- Después: pegá 2-rls-despues-del-lote.sql (el aislamiento entre negocios de las tablas nuevas).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261101120000_modulo_proyectos', '20261101130000_proyecto_gastos', '20261101140000_proyecto_entregables', '20261101150000_proyecto_gestion_eventos')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261101120000_modulo_proyectos · checksum 9a22cd4796073147d32332a49879c83caa5e293ea0f3b6b89df3479e4e61bfb8 ───
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

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '9a22cd4796073147d32332a49879c83caa5e293ea0f3b6b89df3479e4e61bfb8', now(), '20261101120000_modulo_proyectos', NULL, NULL, now(), 1);

-- ─── 20261101130000_proyecto_gastos · checksum e855b4d1eeb58b9253ddc308c7ae80ef75bcca613b00bbc5487350e2340c8ddd ───
-- GASTOS REALES DE UN PROYECTO (MIA Producciones): lo que se le paga o se le debe a cada proveedor por un trabajo,
-- para comparar el costo real contra el presupuestado. Aditiva: una tabla nueva con RLS y una columna nullable con
-- índice único en "CashMovement" (la clave del asiento de cada pago, como "proyectoPagoId"). Los demás negocios no
-- la usan: queda nula.

CREATE TABLE "ProyectoGasto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "supplierId" TEXT,
  "rubro" TEXT NOT NULL DEFAULT 'General',
  "descripcion" TEXT NOT NULL,
  "neto" DOUBLE PRECISION NOT NULL,
  "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comprobante" TEXT,
  "pagadoEl" TIMESTAMP(3),
  "medio" TEXT,
  "pagadoPor" TEXT,
  "anuladoEl" TIMESTAMP(3),
  "anuladoPor" TEXT,
  "cargadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoGasto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoGasto_tenantId_proyectoId_idx" ON "ProyectoGasto"("tenantId", "proyectoId");
CREATE INDEX "ProyectoGasto_tenantId_supplierId_idx" ON "ProyectoGasto"("tenantId", "supplierId");

ALTER TABLE "ProyectoGasto" ADD CONSTRAINT "ProyectoGasto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoGasto" ADD CONSTRAINT "ProyectoGasto_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoGasto" ADD CONSTRAINT "ProyectoGasto_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashMovement" ADD COLUMN "proyectoGastoId" TEXT;
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_proyectoGastoId_fkey"
  FOREIGN KEY ("proyectoGastoId") REFERENCES "ProyectoGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "CashMovement_tenantId_proyectoGastoId_type_key" ON "CashMovement"("tenantId", "proyectoGastoId", "type");

ALTER TABLE "ProyectoGasto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoGasto";
CREATE POLICY tenant_isolation ON "ProyectoGasto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'e855b4d1eeb58b9253ddc308c7ae80ef75bcca613b00bbc5487350e2340c8ddd', now(), '20261101130000_proyecto_gastos', NULL, NULL, now(), 1);

-- ─── 20261101140000_proyecto_entregables · checksum 8364154d4c5d91b5633f822c0f2a1e9f6b494b58da5d723138307cee0c6a21e4 ───
-- ENTREGABLES DE UN PROYECTO (MIA Producciones): cada pieza con sus versiones y la respuesta del cliente desde un link
-- sin login. Aditiva: dos tablas nuevas con RLS y una columna nullable con índice único en "Proyecto", la tabla que
-- crea la primera migración de este lote. No toca nada que usen los demás negocios.

ALTER TABLE "Proyecto" ADD COLUMN "tokenEntregables" TEXT;
CREATE UNIQUE INDEX "Proyecto_tokenEntregables_key" ON "Proyecto"("tokenEntregables");

CREATE TABLE "ProyectoEntregable" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "proyectoId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "especificacion" TEXT NOT NULL DEFAULT '',
  "venceEl" TIMESTAMP(3),
  "anuladoEl" TIMESTAMP(3),
  "anuladoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoEntregable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProyectoEntregable_tenantId_proyectoId_idx" ON "ProyectoEntregable"("tenantId", "proyectoId");

CREATE TABLE "ProyectoEntregableVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "entregableId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
  "datos" TEXT,
  "url" TEXT,
  "nota" TEXT NOT NULL DEFAULT '',
  "especificacion" TEXT NOT NULL DEFAULT '',
  "subidoPor" TEXT,
  "enviadaEl" TIMESTAMP(3),
  "respondidaEl" TIMESTAMP(3),
  "respondidoPor" TEXT,
  "comentario" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoEntregableVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProyectoEntregableVersion_entregableId_numero_key" ON "ProyectoEntregableVersion"("entregableId", "numero");
CREATE INDEX "ProyectoEntregableVersion_tenantId_entregableId_idx" ON "ProyectoEntregableVersion"("tenantId", "entregableId");

ALTER TABLE "ProyectoEntregable" ADD CONSTRAINT "ProyectoEntregable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoEntregable" ADD CONSTRAINT "ProyectoEntregable_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProyectoEntregableVersion" ADD CONSTRAINT "ProyectoEntregableVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProyectoEntregableVersion" ADD CONSTRAINT "ProyectoEntregableVersion_entregableId_fkey" FOREIGN KEY ("entregableId") REFERENCES "ProyectoEntregable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProyectoEntregable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoEntregable";
CREATE POLICY tenant_isolation ON "ProyectoEntregable"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ProyectoEntregableVersion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoEntregableVersion";
CREATE POLICY tenant_isolation ON "ProyectoEntregableVersion"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '8364154d4c5d91b5633f822c0f2a1e9f6b494b58da5d723138307cee0c6a21e4', now(), '20261101140000_proyecto_entregables', NULL, NULL, now(), 1);

-- ─── 20261101150000_proyecto_gestion_eventos · checksum 8e13887f19b844ed84ca29b9b8364b4ab5c67f99fb2aa6e00f42214f9c9ec2d3 ───
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
ALTER TABLE "ProyectoArchivo" ADD COLUMN     "clave" TEXT,
ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "tamanoBytes" INTEGER;

-- CreateTable
CREATE TABLE "ProyectoCuota" (
    "id" TEXT NOT NULL,
    "venceManual" BOOLEAN NOT NULL DEFAULT false,
    "prevista" BOOLEAN NOT NULL DEFAULT false,
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

-- Verificación en dos pasos del panel de una productora. Fuera de "User": los demás negocios no cambian.
CREATE TABLE "ProyectoSegundoFactor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secreto" TEXT NOT NULL,
    "activadoEl" TIMESTAMP(3),
    "ultimoPaso" INTEGER,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "codigosRespaldo" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProyectoSegundoFactor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProyectoSegundoFactor_tenantId_userId_key" ON "ProyectoSegundoFactor"("tenantId", "userId");
ALTER TABLE "ProyectoSegundoFactor" ADD CONSTRAINT "ProyectoSegundoFactor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProyectoSegundoFactor" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProyectoSegundoFactor";
CREATE POLICY tenant_isolation ON "ProyectoSegundoFactor"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- Moneda de venta del evento: el cambio queda fijo en la versión.
ALTER TABLE "ProyectoPresupuesto" ADD COLUMN "tcVenta" DOUBLE PRECISION;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '8e13887f19b844ed84ca29b9b8364b4ab5c67f99fb2aa6e00f42214f9c9ec2d3', now(), '20261101150000_proyecto_gestion_eventos', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 4 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261101120000_modulo_proyectos', '20261101130000_proyecto_gastos', '20261101140000_proyecto_entregables', '20261101150000_proyecto_gestion_eventos') ORDER BY migration_name;
