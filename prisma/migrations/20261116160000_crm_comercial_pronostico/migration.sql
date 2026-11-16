-- CRM comercial · pronóstico y contactos con papel (GSG-CRM-011 · diseño CRM-REINGENIERIA.md §2, «campos que
-- suma la lectura de código abierto»). En la oportunidad: desde cuándo está en la etapa («días en esta etapa»),
-- su última actividad y el cierre esperado. Tabla nueva OportunidadContacto: varios contactos por oportunidad,
-- cada uno con su papel (DECIDE · PIDE · PAGA). Quién aprobó cada pase y cuándo NO suma columna: ya queda en
-- ActividadComercial (fila PASE con usuarioId y createdAt).
-- ADITIVA: tres columnas NULLABLES en Oportunidad (sin CHECK, sin DEFAULT: las filas que hay quedan en NULL)
-- y una tabla nueva con RLS. Sin enum, sin DROP (salvo DROP POLICY IF EXISTS del molde), sin ALTER COLUMN.
-- Depende de 20261116150000_crm_comercial. SIN APLICAR (Gate 2): el código la tolera ausente (esFaltaDeTabla).
-- Vuelta atrás (en este orden):
--   DROP TABLE "OportunidadContacto";
--   ALTER TABLE "Oportunidad" DROP COLUMN "etapaDesde", DROP COLUMN "ultimaActividadEl", DROP COLUMN "cierreEsperadoEl";

-- AlterTable
ALTER TABLE "Oportunidad" ADD COLUMN     "etapaDesde" TIMESTAMP(3),
ADD COLUMN     "ultimaActividadEl" TIMESTAMP(3),
ADD COLUMN     "cierreEsperadoEl" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OportunidadContacto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "oportunidadId" TEXT NOT NULL,
    "contactoId" TEXT NOT NULL,
    "papel" TEXT NOT NULL,
    "vinculadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OportunidadContacto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OportunidadContacto_id_tenantId_key" ON "OportunidadContacto"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OportunidadContacto_vinculo_key" ON "OportunidadContacto"("tenantId", "oportunidadId", "contactoId", "papel");

-- CreateIndex
CREATE INDEX "OportunidadContacto_tenantId_contactoId_idx" ON "OportunidadContacto"("tenantId", "contactoId");

-- AddForeignKey
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_oportunidadId_tenantId_fkey" FOREIGN KEY ("oportunidadId", "tenantId") REFERENCES "Oportunidad"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_contactoId_tenantId_fkey" FOREIGN KEY ("contactoId", "tenantId") REFERENCES "ContactoComercial"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── CHECKs (los mismos valores que src/lib/crm-comercial/motor.ts → PAPELES) ──────────────────────────
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_papel_check" CHECK ("papel" IN ('DECIDE', 'PIDE', 'PAGA'));
ALTER TABLE "OportunidadContacto" ADD CONSTRAINT "OportunidadContacto_vinculadoPor_check" CHECK (length(btrim("vinculadoPor")) > 0);

-- ── RLS: aislamiento por negocio (mismo molde que 20261116150000_crm_comercial) ─────────────────────────

ALTER TABLE "OportunidadContacto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OportunidadContacto";
CREATE POLICY tenant_isolation ON "OportunidadContacto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
