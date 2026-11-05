-- Box «Nail Artist» (docs/tenants/ch/NAIL-ARTIST.md §6). Aditiva: sólo agrega columnas y una tabla; no toca datos.
-- Gate 2: escrita SIN aplicar. El código tolera su ausencia (columna ausente = marca apagada).

ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "aliasCbu" TEXT;
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "titularCuenta" TEXT;
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "cuitTitular" TEXT;
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "boxRentAmount" DECIMAL(14,2);
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "rentPercent" DOUBLE PRECISION;

ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "depositToProfessional" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ProfessionalSettlement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "collectedTotal" DECIMAL(14,2) NOT NULL,
  "percentAmount" DECIMAL(14,2) NOT NULL,
  "rentAmount" DECIMAL(14,2) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "appointmentCount" INTEGER NOT NULL,
  "rentPercent" DOUBLE PRECISION,
  "note" TEXT,
  "settledBy" TEXT NOT NULL,
  "cashMovementId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalSettlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProfessionalSettlement_cashMovementId_key" ON "ProfessionalSettlement"("cashMovementId");
CREATE UNIQUE INDEX "ProfessionalSettlement_tenantId_professionalId_periodStart_periodEnd_key" ON "ProfessionalSettlement"("tenantId", "professionalId", "periodStart", "periodEnd");
CREATE INDEX "ProfessionalSettlement_tenantId_createdAt_idx" ON "ProfessionalSettlement"("tenantId", "createdAt");
CREATE INDEX "ProfessionalSettlement_professionalId_idx" ON "ProfessionalSettlement"("professionalId");

ALTER TABLE "ProfessionalSettlement" ADD CONSTRAINT "ProfessionalSettlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfessionalSettlement" ADD CONSTRAINT "ProfessionalSettlement_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El turno rendido queda marcado: no vuelve a ser comisión pendiente (doble cobro).
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "settlementId" TEXT;
CREATE INDEX IF NOT EXISTS "Appointment_settlementId_idx" ON "Appointment"("settlementId");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ProfessionalSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProfessionalSettlement" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProfessionalSettlement";
CREATE POLICY tenant_isolation ON "ProfessionalSettlement"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- Box que abre SÓLO los días que CH elige (NAIL-ARTIST.md §2): la manicura no va todos los días.
ALTER TABLE "Box" ADD COLUMN IF NOT EXISTS "soloDiasAbiertos" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "BoxDiaAbierto" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "boxId" TEXT NOT NULL,
  "fecha" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "BoxDiaAbierto_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BoxDiaAbierto_boxId_fecha_key" ON "BoxDiaAbierto"("boxId", "fecha");
CREATE INDEX "BoxDiaAbierto_tenantId_idx" ON "BoxDiaAbierto"("tenantId");
ALTER TABLE "BoxDiaAbierto" ADD CONSTRAINT "BoxDiaAbierto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoxDiaAbierto" ADD CONSTRAINT "BoxDiaAbierto_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BoxDiaAbierto" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BoxDiaAbierto";
CREATE POLICY tenant_isolation ON "BoxDiaAbierto"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
