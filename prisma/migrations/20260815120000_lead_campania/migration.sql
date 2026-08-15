-- Contacto captado por una campaña presencial (QR del evento).
-- Vive aparte de "Client": es un contacto de marketing, no una clienta del negocio.
CREATE TABLE "LeadCampania" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campania" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "instagram" TEXT,
    "aceptaDifusion" BOOLEAN NOT NULL DEFAULT false,
    "consentimientoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCampania_pkey" PRIMARY KEY ("id")
);

-- Una inscripción por teléfono y campaña: hace el alta idempotente.
CREATE UNIQUE INDEX "LeadCampania_tenantId_campania_telefono_key"
    ON "LeadCampania"("tenantId", "campania", "telefono");

CREATE INDEX "LeadCampania_tenantId_campania_idx"
    ON "LeadCampania"("tenantId", "campania");

ALTER TABLE "LeadCampania"
    ADD CONSTRAINT "LeadCampania_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
