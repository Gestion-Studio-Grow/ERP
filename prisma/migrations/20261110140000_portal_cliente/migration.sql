-- MIA Etapa 2 · T5 — portal por cliente. ADITIVA: sólo crea la tabla "PortalCliente"; no toca ninguna existente
-- (no es una columna en "Client": un select de Client sin la migración aplicada rompería). Sin aplicar (Gate 2) y
-- fuera de prisma/lote-deploy.txt: el código pregunta si la tabla existe (information_schema) antes de tocarla;
-- sin tabla no se ofrece el link y la página pública da 404.
--
-- La llave a Client es COMPUESTA (tenantId, clientId) → Client(tenantId, id): la base impide que una fila de un
-- negocio apunte al cliente de otro. Para eso "Client" gana el UNIQUE (tenantId, id) (aditivo: id ya es PK, así que
-- ninguna fila existente puede violarlo), con el nombre que genera Prisma, como SupportTicket/Invoice.

CREATE UNIQUE INDEX IF NOT EXISTS "Client_tenantId_id_key" ON "Client"("tenantId", "id");

CREATE TABLE IF NOT EXISTS "PortalCliente" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "creadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalCliente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PortalCliente_token_key" ON "PortalCliente"("token");
-- Un link por cliente: dos «Generar» a la vez dan una sola fila (ON CONFLICT DO NOTHING en la app).
CREATE UNIQUE INDEX IF NOT EXISTS "PortalCliente_tenantId_clientId_key" ON "PortalCliente"("tenantId", "clientId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PortalCliente_tenantId_fkey') THEN
    ALTER TABLE "PortalCliente" ADD CONSTRAINT "PortalCliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PortalCliente_tenantId_clientId_fkey') THEN
    ALTER TABLE "PortalCliente" ADD CONSTRAINT "PortalCliente_tenantId_clientId_fkey" FOREIGN KEY ("tenantId", "clientId") REFERENCES "Client"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS en la misma migración (check-coverage.mjs, segunda red): cada negocio ve sólo sus links.
ALTER TABLE "PortalCliente" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PortalCliente";
CREATE POLICY tenant_isolation ON "PortalCliente"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
