-- Paquete Peluquerías (T4): ficha técnica de color de la clienta.
-- ADITIVA: sólo crea la tabla "FichaColor"; no toca tablas existentes.
-- Escrita SIN aplicar (Gate 2): la aplica el dueño. Sin la tabla, la ficha de la clienta
-- muestra «migración pendiente» (P2021/42P01) y el resto de la ficha funciona igual.
-- SÓLO datos técnicos (fórmula, tono, oxidante, tiempo de pose). Ningún campo de salud/alergias.
-- Rollback: DROP TABLE IF EXISTS "FichaColor"; (se lleva índices, FKs, CHECKs y la policy).

CREATE TABLE "FichaColor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tono" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "oxidante" INTEGER,
    "tiempoPose" INTEGER,
    "profesional" TEXT,
    "notas" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FichaColor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FichaColor_tenantId_clientId_fecha_idx" ON "FichaColor"("tenantId", "clientId", "fecha");

ALTER TABLE "FichaColor" ADD CONSTRAINT "FichaColor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FichaColor" ADD CONSTRAINT "FichaColor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FichaColor" ADD CONSTRAINT "FichaColor_oxidante_check" CHECK ("oxidante" IS NULL OR "oxidante" IN (10, 20, 30, 40));
ALTER TABLE "FichaColor" ADD CONSTRAINT "FichaColor_tiempoPose_check" CHECK ("tiempoPose" IS NULL OR "tiempoPose" BETWEEN 1 AND 240);
ALTER TABLE "FichaColor" ADD CONSTRAINT "FichaColor_textos_check" CHECK (length("tono") BETWEEN 1 AND 80 AND length("formula") BETWEEN 1 AND 500 AND ("notas" IS NULL OR length("notas") <= 500));

-- RLS: aislamiento por tenant (mismo patrón que el resto de las tablas con "tenantId").
ALTER TABLE "FichaColor" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FichaColor";
CREATE POLICY tenant_isolation ON "FichaColor"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
