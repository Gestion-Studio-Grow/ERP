-- Esquema unificado (esquema-unificado.md) traducido literalmente, + D1..D4 del 09 donde se indica.
ALTER TABLE "AgenteContador" ADD COLUMN "monto" BIGINT NOT NULL DEFAULT 0, ADD COLUMN "moneda" TEXT NOT NULL DEFAULT 'ARS';
ALTER TABLE "AgenteContador" DROP CONSTRAINT "AgenteContador_pkey", ADD CONSTRAINT "AgenteContador_pkey" PRIMARY KEY ("tenantId","puesto","tope","sujeto","periodo","moneda");
ALTER TABLE "AgenteContador" ADD CONSTRAINT "AgenteContador_monto_check" CHECK ("monto" >= 0);
CREATE UNIQUE INDEX "AgentePedido_tenantId_id_userId_key" ON "AgentePedido"("tenantId","id","userId");
ALTER TABLE "AgentePropuesta" ADD COLUMN "clave" TEXT NOT NULL, ADD COLUMN "origen" TEXT NOT NULL, ADD COLUMN "modo" TEXT,
  ADD COLUMN "autorizacionId" TEXT, ADD COLUMN "autorizacionVersion" INTEGER, ADD COLUMN "montoCentavos" BIGINT, ADD COLUMN "moneda" TEXT,
  ADD COLUMN "contraparte" TEXT, ADD COLUMN "revierteA" TEXT, ADD COLUMN "revertibleHasta" TIMESTAMP(3), ADD COLUMN "pedidoId" TEXT, ADD COLUMN "solicitadoPor" TEXT,
  ADD COLUMN "fuenteTipo" TEXT, ADD COLUMN "fuenteId" TEXT;
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_origen_check" CHECK (origen IN ('RUTINA','PEDIDO'));
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_origen_pedido_check" CHECK (origen <> 'PEDIDO' OR "pedidoId" IS NOT NULL);
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_monto_check" CHECK ((("montoCentavos" IS NULL) = ("moneda" IS NULL)) AND ("montoCentavos" IS NULL OR "montoCentavos" > 0));
ALTER TABLE "AgentePropuesta" DROP CONSTRAINT "AgentePropuesta_estado_check";
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_estado_check" CHECK ("estado" IN ('PENDIENTE','EJECUTADA','RECHAZADA','VENCIDA','FALLIDA','REVERTIDA'));
CREATE UNIQUE INDEX "AgentePropuesta_tenantId_clave_viva_key" ON "AgentePropuesta"("tenantId","clave") WHERE "estado" IN ('PENDIENTE','EJECUTADA','REVERTIDA');
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_tenantId_pedidoId_solicitadoPor_fkey" FOREIGN KEY ("tenantId","pedidoId","solicitadoPor") REFERENCES "AgentePedido"("tenantId","id","userId");
-- D3 y D4 del 09
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_fuente_check" CHECK (NOT (modo = 'REGLA' AND "montoCentavos" IS NOT NULL) OR "fuenteId" IS NOT NULL);
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_regla_check" CHECK (modo IS DISTINCT FROM 'REGLA' OR "autorizacionId" IS NOT NULL);

CREATE TABLE "AgenteAutorizacion" ("id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL REFERENCES "Tenant"(id), "version" INTEGER NOT NULL,
  "textoVersion" INTEGER NOT NULL, "textoHash" TEXT NOT NULL, "firmante" TEXT NOT NULL, "firmanteUserId" TEXT, "firmadoEl" TIMESTAMP(3) NOT NULL,
  "metodo" TEXT NOT NULL, "evidencia" JSONB, "operaciones" JSONB NOT NULL, "topes" JSONB NOT NULL, "vigenteDesde" TIMESTAMP(3) NOT NULL, "venceEl" TIMESTAMP(3) NOT NULL,
  "reemplazadaEl" TIMESTAMP(3), "revocadaEl" TIMESTAMP(3), "revocadaPor" TEXT, "motivoRevocacion" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now());
CREATE UNIQUE INDEX "AgenteAutorizacion_tenantId_version_key" ON "AgenteAutorizacion"("tenantId","version");
CREATE UNIQUE INDEX "AgenteAutorizacion_tenantId_id_key" ON "AgenteAutorizacion"("tenantId","id");
CREATE UNIQUE INDEX "AgenteAutorizacion_tenantId_viva_key" ON "AgenteAutorizacion"("tenantId") WHERE "revocadaEl" IS NULL AND "reemplazadaEl" IS NULL;
ALTER TABLE "AgenteAutorizacion" ADD CONSTRAINT "AgenteAutorizacion_firmante_check" CHECK (metodo <> 'APP_CON_SESION' OR "firmanteUserId" IS NOT NULL);
ALTER TABLE "AgenteAutorizacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AgenteAutorizacion" USING ("tenantId" = current_setting('app.current_tenant_id', true)) WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgenteAutorizacion" TO app_rls;  -- lo que da el default privileges de 0002:63-64
REVOKE UPDATE, DELETE ON "AgenteAutorizacion" FROM app_rls;
GRANT UPDATE ("revocadaEl","revocadaPor","motivoRevocacion","reemplazadaEl") ON "AgenteAutorizacion" TO app_rls;
CREATE FUNCTION autorizacion_revocacion_irreversible() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD."revocadaEl" IS NOT NULL THEN RAISE EXCEPTION 'revocacion irreversible'; END IF; RETURN NEW; END $$;
CREATE TRIGGER "AgenteAutorizacion_revocacion_irreversible" BEFORE UPDATE ON "AgenteAutorizacion" FOR EACH ROW EXECUTE FUNCTION autorizacion_revocacion_irreversible();
ALTER TABLE "AgentePropuesta" ADD CONSTRAINT "AgentePropuesta_tenantId_autorizacionId_fkey" FOREIGN KEY ("tenantId","autorizacionId") REFERENCES "AgenteAutorizacion"("tenantId","id");
-- AgentePedido tal como lo escribe el esquema unificado (H6)
REVOKE UPDATE ("userId","clave","pedidoEl") ON "AgentePedido" FROM app_rls;
