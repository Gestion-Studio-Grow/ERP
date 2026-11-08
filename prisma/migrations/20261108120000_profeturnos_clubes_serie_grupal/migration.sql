-- ProfeTurnos (módulo padel-clases) · E4 Clubes + E8 Clase fija semanal + E7 Grupal con integrantes.
-- ADITIVA: 3 tablas nuevas y 3 columnas nulables (PadelDisponibilidad.clubId, PadelClase.clubId,
-- PadelClase.serieId). No toca datos existentes; con todo en NULL el módulo anda como antes.
-- RLS en las tablas nuevas con la misma política que 20261015120000_modulo_padel_clases.

-- AlterTable
ALTER TABLE "PadelDisponibilidad" ADD COLUMN     "clubId" TEXT;

-- AlterTable
ALTER TABLE "PadelClase" ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "serieId" TEXT;

-- CreateTable
CREATE TABLE "PadelClub" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "mapsUrl" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelSerie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "clubId" TEXT,
    "diaSemana" INTEGER NOT NULL,
    "hora" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "personas" INTEGER NOT NULL DEFAULT 1,
    "desde" DATE NOT NULL,
    "hasta" DATE,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "canceladaEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelSerie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelIntegrante" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "alumnoId" TEXT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "monto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pagoEstado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "pagoMedio" TEXT,
    "comprobante" TEXT,
    "comprobanteEnviadoEl" TIMESTAMP(3),
    "pagoValidadoEl" TIMESTAMP(3),
    "pagoNota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelIntegrante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PadelClub_tenantId_activo_idx" ON "PadelClub"("tenantId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "PadelClub_tenantId_nombre_key" ON "PadelClub"("tenantId", "nombre");

-- CreateIndex
CREATE INDEX "PadelSerie_tenantId_activa_idx" ON "PadelSerie"("tenantId", "activa");

-- CreateIndex
CREATE INDEX "PadelSerie_tenantId_alumnoId_idx" ON "PadelSerie"("tenantId", "alumnoId");

-- CreateIndex
CREATE INDEX "PadelIntegrante_tenantId_claseId_idx" ON "PadelIntegrante"("tenantId", "claseId");

-- CreateIndex
CREATE INDEX "PadelIntegrante_tenantId_alumnoId_idx" ON "PadelIntegrante"("tenantId", "alumnoId");

-- CreateIndex
CREATE INDEX "PadelIntegrante_tenantId_pagoEstado_idx" ON "PadelIntegrante"("tenantId", "pagoEstado");

-- CreateIndex
CREATE UNIQUE INDEX "PadelIntegrante_claseId_alumnoId_key" ON "PadelIntegrante"("claseId", "alumnoId");

-- CreateIndex
CREATE INDEX "PadelClase_tenantId_serieId_idx" ON "PadelClase"("tenantId", "serieId");

-- AddForeignKey
ALTER TABLE "PadelDisponibilidad" ADD CONSTRAINT "PadelDisponibilidad_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "PadelClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClase" ADD CONSTRAINT "PadelClase_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "PadelClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClase" ADD CONSTRAINT "PadelClase_serieId_fkey" FOREIGN KEY ("serieId") REFERENCES "PadelSerie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelClub" ADD CONSTRAINT "PadelClub_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelSerie" ADD CONSTRAINT "PadelSerie_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelSerie" ADD CONSTRAINT "PadelSerie_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelSerie" ADD CONSTRAINT "PadelSerie_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "PadelClub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelIntegrante" ADD CONSTRAINT "PadelIntegrante_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelIntegrante" ADD CONSTRAINT "PadelIntegrante_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "PadelClase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelIntegrante" ADD CONSTRAINT "PadelIntegrante_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- RLS por tenant (mismo patrón que el módulo).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['PadelClub', 'PadelSerie', 'PadelIntegrante']
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
