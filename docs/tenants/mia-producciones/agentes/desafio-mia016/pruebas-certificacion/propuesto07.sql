-- Traducción literal de 07 §3.1 y §3.2 (lo que el diseño propone sumar a la migración).
ALTER TABLE "AgenteContador" ADD COLUMN "monto" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "AgentePropuesta" ADD COLUMN "clave" TEXT, ADD COLUMN "modo" TEXT, ADD COLUMN "autorizacionId" TEXT,
  ADD COLUMN "autorizacionVersion" INTEGER, ADD COLUMN "montoCentavos" BIGINT, ADD COLUMN "contraparte" TEXT,
  ADD COLUMN "revierteA" TEXT, ADD COLUMN "revertibleHasta" TIMESTAMP(3), ADD COLUMN "pedidoId" TEXT, ADD COLUMN "solicitadoPor" TEXT;
ALTER TABLE "AgentePropuesta" DROP CONSTRAINT "AgentePropuesta_estado_check";
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_estado_check" CHECK ("estado" IN ('PENDIENTE','EJECUTADA','RECHAZADA','VENCIDA','FALLIDA','REVERTIDA'));
CREATE UNIQUE INDEX "AgentePropuesta_tenantId_clave_viva_key" ON "AgentePropuesta"("tenantId","clave") WHERE "estado" IN ('PENDIENTE','EJECUTADA');
CREATE UNIQUE INDEX "AgentePropuesta_tenantId_revierteA_key" ON "AgentePropuesta"("tenantId","revierteA") WHERE "estado"='EJECUTADA';
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_procedencia_check" CHECK (("pedidoId" IS NULL) = ("solicitadoPor" IS NULL));
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_tenantId_pedidoId_fkey" FOREIGN KEY ("tenantId","pedidoId") REFERENCES "AgentePedido"("tenantId","id");
CREATE TABLE "AgenteAutorizacion" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"(id), "version" INTEGER NOT NULL,
  "textoVersion" TEXT NOT NULL, "textoHash" TEXT NOT NULL, "firmante" TEXT NOT NULL, "firmanteUserId" TEXT, "firmadoEl" TIMESTAMP(3) NOT NULL,
  "metodo" TEXT NOT NULL, "operaciones" JSONB NOT NULL, "topes" JSONB NOT NULL, "vigenteDesde" TIMESTAMP(3) NOT NULL, "venceEl" TIMESTAMP(3) NOT NULL,
  "revocadaEl" TIMESTAMP(3), "revocadaPor" TEXT);
CREATE UNIQUE INDEX "AgenteAutorizacion_tenantId_version_key" ON "AgenteAutorizacion"("tenantId","version");
ALTER TABLE "AgenteAutorizacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgenteAutorizacion" USING ("tenantId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
REVOKE DELETE ON "AgenteAutorizacion" FROM app_rls;
INSERT INTO "Tenant" VALUES ('A'),('B');
