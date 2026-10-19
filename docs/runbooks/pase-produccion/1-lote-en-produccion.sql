-- =============================================================================
-- PASE A PRODUCCIÓN — el lote vigente de prisma/lote-deploy.txt (hoy: 1 migración,
-- 20261015120000_modulo_padel_clases). Se pega en el SQL Editor de Neon, en la rama de
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
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name IN ('20261015120000_modulo_padel_clases')) THEN
    RAISE EXCEPTION 'Alguna migración del lote ya figura en _prisma_migrations: no se vuelve a aplicar encima.';
  END IF;
END $$;

-- ─── 20261015120000_modulo_padel_clases · checksum 327a8d5578a60564f00ac2ba553d396ed04afa2a330a20b0a38824e470096ff0 ───
-- Módulo PADEL-CLASES: el turnero y la agenda de un profe de pádel. Aditiva: sólo tablas
-- nuevas (configuración, franjas, alumnos, clases y avisos), sin tocar ninguna tabla
-- existente ni datos de ningún negocio. Plata en numeric(14,2) (ADR-100).
-- SIN APLICAR en Neon y fuera de prisma/lote-deploy.txt: se aplica con OK del dueño (Gate 2).

-- CreateTable
CREATE TABLE "PadelConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "duracionMin" INTEGER NOT NULL DEFAULT 60,
    "precioIndividual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "precioGrupal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "aliasCbu" TEXT,
    "titularCuenta" TEXT,
    "anticipacionMin" INTEGER NOT NULL DEFAULT 120,
    "diasAdelante" INTEGER NOT NULL DEFAULT 14,
    "maxPendientesPorTel" INTEGER NOT NULL DEFAULT 2,
    "whatsappProfe" TEXT,
    "plantillas" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelDisponibilidad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "diaSemana" INTEGER,
    "fecha" DATE,
    "desde" TEXT NOT NULL,
    "hasta" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'DA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelDisponibilidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelAlumno" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT '',
    "notas" TEXT,
    "recibeAvisos" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelAlumno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelClase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "empiezaEn" TIMESTAMP(3) NOT NULL,
    "terminaEn" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "personas" INTEGER NOT NULL DEFAULT 1,
    "estado" TEXT NOT NULL DEFAULT 'PEDIDA',
    "origen" TEXT NOT NULL DEFAULT 'TURNERO',
    "repiteDe" TEXT,
    "precio" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pagoEstado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "pagoMedio" TEXT,
    "comprobante" TEXT,
    "comprobanteEnviadoEl" TIMESTAMP(3),
    "pagoValidadoEl" TIMESTAMP(3),
    "pagoNota" TEXT,
    "confirmadaEl" TIMESTAMP(3),
    "rechazadaEl" TIMESTAMP(3),
    "dadaEl" TIMESTAMP(3),
    "canceladaEl" TIMESTAMP(3),
    "motivoCancel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelClase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelAviso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "claseId" TEXT,
    "alumnoId" TEXT,
    "texto" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'APP',
    "leidoEl" TIMESTAMP(3),
    "enviadoEl" TIMESTAMP(3),
    "errorEnvio" TEXT,
    "idExterno" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelAviso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PadelConfig_tenantId_key" ON "PadelConfig"("tenantId");

-- CreateIndex
CREATE INDEX "PadelDisponibilidad_tenantId_diaSemana_idx" ON "PadelDisponibilidad"("tenantId", "diaSemana");

-- CreateIndex
CREATE INDEX "PadelDisponibilidad_tenantId_fecha_idx" ON "PadelDisponibilidad"("tenantId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "PadelAlumno_clientId_key" ON "PadelAlumno"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "PadelAlumno_token_key" ON "PadelAlumno"("token");

-- CreateIndex
CREATE INDEX "PadelAlumno_tenantId_idx" ON "PadelAlumno"("tenantId");

-- CreateIndex
CREATE INDEX "PadelClase_tenantId_empiezaEn_idx" ON "PadelClase"("tenantId", "empiezaEn");

-- CreateIndex
CREATE INDEX "PadelClase_tenantId_estado_idx" ON "PadelClase"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "PadelClase_tenantId_alumnoId_idx" ON "PadelClase"("tenantId", "alumnoId");

-- CreateIndex
CREATE INDEX "PadelClase_tenantId_pagoEstado_idx" ON "PadelClase"("tenantId", "pagoEstado");

-- CreateIndex
CREATE INDEX "PadelAviso_tenantId_destino_leidoEl_idx" ON "PadelAviso"("tenantId", "destino", "leidoEl");

-- CreateIndex
CREATE INDEX "PadelAviso_tenantId_createdAt_idx" ON "PadelAviso"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PadelAviso_tenantId_idExterno_key" ON "PadelAviso"("tenantId", "idExterno");

-- AddForeignKey
ALTER TABLE "PadelConfig" ADD CONSTRAINT "PadelConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelDisponibilidad" ADD CONSTRAINT "PadelDisponibilidad_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelAlumno" ADD CONSTRAINT "PadelAlumno_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelAlumno" ADD CONSTRAINT "PadelAlumno_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClase" ADD CONSTRAINT "PadelClase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClase" ADD CONSTRAINT "PadelClase_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClase" ADD CONSTRAINT "PadelClase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelAviso" ADD CONSTRAINT "PadelAviso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelAviso" ADD CONSTRAINT "PadelAviso_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "PadelClase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelAviso" ADD CONSTRAINT "PadelAviso_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── RLS de las tablas nuevas (misma política que prisma/rls/0001_enable_rls.sql) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'PadelConfig', 'PadelDisponibilidad', 'PadelAlumno', 'PadelClase', 'PadelAviso'
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
VALUES (gen_random_uuid()::text, '327a8d5578a60564f00ac2ba553d396ed04afa2a330a20b0a38824e470096ff0', now(), '20261015120000_modulo_padel_clases', NULL, NULL, now(), 1);

COMMIT;

-- Verificación (sólo lectura): 1 filas, todas con finished_at.
SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name IN ('20261015120000_modulo_padel_clases') ORDER BY migration_name;
