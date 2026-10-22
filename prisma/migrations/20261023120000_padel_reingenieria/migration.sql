-- Reingeniería «Clases de pádel» · TANDA 4 — el modelo: clubes (y lo que el profe le paga a cada
-- club), turnos fijos (series), paquetes, grupales con participantes, pago parcial, reglas de cobro,
-- suscripciones push y lista de espera.
--
-- ADITIVA: siete tablas nuevas y columnas nuevas, todas con DEFAULT o NULL, en PadelConfig,
-- PadelDisponibilidad y PadelClase. No borra, no renombra ni cambia el tipo de nada; no toca datos.
-- Plata en numeric(14,2) (ADR-100). RLS adentro (mismo bloque que 20261015120000_modulo_padel_clases).
--
-- ⚠ GATE 2: SIN APLICAR en Neon y FUERA de prisma/lote-deploy.txt. Se aplica sólo con OK explícito del
-- dueño. El código de la app anda con y sin esta migración (src/lib/padel/modelo.server.ts).

-- AlterTable
ALTER TABLE "PadelConfig" ADD COLUMN     "ausenteSeCobra" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cierreAutoHoras" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "confirmarConocidos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "recordatorioHora" TEXT,
ADD COLUMN     "tardiaSeCobra" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trasladoMinDefault" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PadelDisponibilidad" ADD COLUMN     "clubId" TEXT;

-- AlterTable
ALTER TABLE "PadelClase" ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "costoCancha" DECIMAL(14,2),
ADD COLUMN     "cupo" INTEGER,
ADD COLUMN     "nota" TEXT,
ADD COLUMN     "pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paqueteAlumnoId" TEXT,
ADD COLUMN     "seCobra" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "serieFecha" DATE,
ADD COLUMN     "serieId" TEXT;

-- CreateTable
CREATE TABLE "PadelClub" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "mapsUrl" TEXT,
    "trasladoMin" INTEGER NOT NULL DEFAULT 0,
    "costoCancha" DECIMAL(14,2),
    "modoCobroClub" TEXT,
    "techada" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelSerie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "hora" TEXT NOT NULL,
    "duracionMin" INTEGER NOT NULL DEFAULT 60,
    "tipo" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "personas" INTEGER NOT NULL DEFAULT 1,
    "clubId" TEXT,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "pausadaDesde" DATE,
    "pausadaHasta" DATE,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelSerie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelPaquete" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clases" INTEGER NOT NULL,
    "precio" DECIMAL(14,2) NOT NULL,
    "venceDias" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelPaquete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelPaqueteAlumno" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paqueteId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "clasesTotal" INTEGER NOT NULL,
    "clasesUsadas" INTEGER NOT NULL DEFAULT 0,
    "precio" DECIMAL(14,2) NOT NULL,
    "pagoEstado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "pagoMedio" TEXT,
    "compradoEl" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEl" TIMESTAMP(3) NOT NULL,
    "extendidoHasta" TIMESTAMP(3),
    "idempotencia" TEXT,

    CONSTRAINT "PadelPaqueteAlumno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelParticipante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "alumnoId" TEXT,
    "nombre" TEXT,
    "precio" DECIMAL(14,2) NOT NULL,
    "pagoEstado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "pagoMedio" TEXT,
    "comprobante" TEXT,
    "comprobanteEnviadoEl" TIMESTAMP(3),
    "pagoValidadoEl" TIMESTAMP(3),
    "pagoNota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelParticipante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelSuscripcionPush" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelSuscripcionPush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelEspera" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "fecha" DATE,
    "desde" TEXT,
    "hasta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelEspera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PadelClub_tenantId_activo_idx" ON "PadelClub"("tenantId", "activo");

-- CreateIndex
CREATE INDEX "PadelSerie_tenantId_activa_idx" ON "PadelSerie"("tenantId", "activa");

-- CreateIndex
CREATE INDEX "PadelSerie_tenantId_alumnoId_idx" ON "PadelSerie"("tenantId", "alumnoId");

-- CreateIndex
CREATE INDEX "PadelPaquete_tenantId_activo_idx" ON "PadelPaquete"("tenantId", "activo");

-- CreateIndex
CREATE INDEX "PadelPaqueteAlumno_tenantId_alumnoId_idx" ON "PadelPaqueteAlumno"("tenantId", "alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "PadelPaqueteAlumno_tenantId_idempotencia_key" ON "PadelPaqueteAlumno"("tenantId", "idempotencia");

-- CreateIndex
CREATE INDEX "PadelParticipante_tenantId_claseId_idx" ON "PadelParticipante"("tenantId", "claseId");

-- CreateIndex
CREATE INDEX "PadelParticipante_tenantId_alumnoId_idx" ON "PadelParticipante"("tenantId", "alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "PadelParticipante_claseId_alumnoId_key" ON "PadelParticipante"("claseId", "alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "PadelSuscripcionPush_tenantId_endpoint_key" ON "PadelSuscripcionPush"("tenantId", "endpoint");

-- CreateIndex
CREATE INDEX "PadelEspera_tenantId_fecha_idx" ON "PadelEspera"("tenantId", "fecha");

-- CreateIndex
CREATE INDEX "PadelClase_tenantId_clubId_idx" ON "PadelClase"("tenantId", "clubId");

-- CreateIndex
CREATE INDEX "PadelClase_tenantId_paqueteAlumnoId_idx" ON "PadelClase"("tenantId", "paqueteAlumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "PadelClase_serieId_serieFecha_key" ON "PadelClase"("serieId", "serieFecha");

-- AddForeignKey
ALTER TABLE "PadelDisponibilidad" ADD CONSTRAINT "PadelDisponibilidad_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "PadelClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClase" ADD CONSTRAINT "PadelClase_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "PadelClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClase" ADD CONSTRAINT "PadelClase_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "PadelSerie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClase" ADD CONSTRAINT "PadelClase_paqueteAlumnoId_fkey" FOREIGN KEY ("paqueteAlumnoId") REFERENCES "PadelPaqueteAlumno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClub" ADD CONSTRAINT "PadelClub_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelSerie" ADD CONSTRAINT "PadelSerie_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelSerie" ADD CONSTRAINT "PadelSerie_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelSerie" ADD CONSTRAINT "PadelSerie_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "PadelClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPaquete" ADD CONSTRAINT "PadelPaquete_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPaqueteAlumno" ADD CONSTRAINT "PadelPaqueteAlumno_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPaqueteAlumno" ADD CONSTRAINT "PadelPaqueteAlumno_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "PadelPaquete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPaqueteAlumno" ADD CONSTRAINT "PadelPaqueteAlumno_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelParticipante" ADD CONSTRAINT "PadelParticipante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelParticipante" ADD CONSTRAINT "PadelParticipante_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "PadelClase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelParticipante" ADD CONSTRAINT "PadelParticipante_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelSuscripcionPush" ADD CONSTRAINT "PadelSuscripcionPush_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelEspera" ADD CONSTRAINT "PadelEspera_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelEspera" ADD CONSTRAINT "PadelEspera_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ── RLS de las tablas nuevas (misma política que prisma/rls/0001_enable_rls.sql) ──
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'PadelClub', 'PadelSerie', 'PadelPaquete', 'PadelPaqueteAlumno', 'PadelParticipante',
    'PadelSuscripcionPush', 'PadelEspera'
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
