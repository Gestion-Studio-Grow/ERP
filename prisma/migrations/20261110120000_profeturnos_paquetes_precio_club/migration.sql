-- ProfeTurnos (módulo padel-clases) · T5: paquetes de clases y precio por club.
-- ADITIVA: SÓLO 3 tablas nuevas (PadelPaquete, PadelPaqueteUso, PadelPrecioClub). No agrega columnas
-- a tablas existentes ni toca datos. Mientras no se aplique, el código la tolera (P2021 → paquetes
-- ocultos y precio de PadelConfig). Gate 2: se escribe sin aplicar.
-- RLS en las tablas nuevas con la misma política que 20261015120000_modulo_padel_clases y
-- 20261108120000_profeturnos_clubes_serie_grupal.

-- CreateTable
CREATE TABLE "PadelPaquete" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alumnoId" TEXT NOT NULL,
    "clases" INTEGER NOT NULL,
    "precio" DECIMAL(14,2) NOT NULL,
    "pagoMedio" TEXT NOT NULL,
    "pagadoEl" TIMESTAMP(3) NOT NULL,
    "nota" TEXT,
    "claveIdem" TEXT,
    "anuladoEl" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelPaquete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelPaqueteUso" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paqueteId" TEXT NOT NULL,
    "claseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PadelPaqueteUso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PadelPrecioClub" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "precioIndividual" DECIMAL(14,2),
    "precioGrupal" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PadelPrecioClub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PadelPaquete_tenantId_alumnoId_idx" ON "PadelPaquete"("tenantId", "alumnoId");

-- CreateIndex
CREATE INDEX "PadelPaquete_tenantId_pagadoEl_idx" ON "PadelPaquete"("tenantId", "pagadoEl");

-- CreateIndex
CREATE UNIQUE INDEX "PadelPaquete_tenantId_claveIdem_key" ON "PadelPaquete"("tenantId", "claveIdem");

-- CreateIndex
CREATE UNIQUE INDEX "PadelPaqueteUso_claseId_key" ON "PadelPaqueteUso"("claseId");

-- CreateIndex
CREATE INDEX "PadelPaqueteUso_tenantId_paqueteId_idx" ON "PadelPaqueteUso"("tenantId", "paqueteId");

-- CreateIndex
CREATE UNIQUE INDEX "PadelPrecioClub_clubId_key" ON "PadelPrecioClub"("clubId");

-- CreateIndex
CREATE INDEX "PadelPrecioClub_tenantId_idx" ON "PadelPrecioClub"("tenantId");

-- AddForeignKey
ALTER TABLE "PadelPaquete" ADD CONSTRAINT "PadelPaquete_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPaquete" ADD CONSTRAINT "PadelPaquete_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "PadelAlumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPaqueteUso" ADD CONSTRAINT "PadelPaqueteUso_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPaqueteUso" ADD CONSTRAINT "PadelPaqueteUso_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "PadelPaquete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPaqueteUso" ADD CONSTRAINT "PadelPaqueteUso_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "PadelClase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPrecioClub" ADD CONSTRAINT "PadelPrecioClub_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PadelPrecioClub" ADD CONSTRAINT "PadelPrecioClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "PadelClub"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invariantes de plata en la base (Prisma no las modela; no generan drift).
ALTER TABLE "PadelPaquete" ADD CONSTRAINT "PadelPaquete_clases_check" CHECK ("clases" > 0 AND "clases" <= 100);
ALTER TABLE "PadelPaquete" ADD CONSTRAINT "PadelPaquete_precio_check" CHECK ("precio" >= 0);
ALTER TABLE "PadelPrecioClub" ADD CONSTRAINT "PadelPrecioClub_precios_check" CHECK (("precioIndividual" IS NULL OR "precioIndividual" >= 0) AND ("precioGrupal" IS NULL OR "precioGrupal" >= 0));

-- RLS por tenant (mismo patrón que el módulo).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['PadelPaquete', 'PadelPaqueteUso', 'PadelPrecioClub']
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
