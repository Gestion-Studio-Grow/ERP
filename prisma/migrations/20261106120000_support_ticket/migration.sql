-- Consola de soporte GSG, tanda 1 (SupportTicket + SupportTicketEvento). ADITIVA: sólo agrega dos
-- tablas; no toca ninguna existente ni crea enums (tipo/prioridad/estado/canal son TEXT validado por
-- src/lib/soporte/config.ts). Sin aplicar (Gate 2): el código tolera su ausencia (P2021 → sin tickets,
-- el pedido sigue quedando en AuditLog como hasta hoy).

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "numero" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL,
  "prioridad" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'nuevo',
  "asunto" TEXT NOT NULL,
  "detalle" TEXT,
  "canal" TEXT NOT NULL,
  "origenId" TEXT,
  "clienteTenantId" TEXT,
  "creadoPor" TEXT NOT NULL,
  "asignadoA" TEXT,
  "respuesta" TEXT,
  "borradorIa" JSONB,
  "venceEl" TIMESTAMP(3),
  "respondidoEl" TIMESTAMP(3),
  "resueltoEl" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
-- Destino de la llave foránea compuesta de SupportTicketEvento: un evento no puede colgar de un
-- ticket de otro negocio (la base lo impide, no sólo RLS).
CREATE UNIQUE INDEX "SupportTicket_tenantId_id_key" ON "SupportTicket"("tenantId", "id");
CREATE UNIQUE INDEX "SupportTicket_tenantId_numero_key" ON "SupportTicket"("tenantId", "numero");
CREATE UNIQUE INDEX "SupportTicket_tenantId_origenId_key" ON "SupportTicket"("tenantId", "origenId");
CREATE INDEX "SupportTicket_tenantId_estado_createdAt_idx" ON "SupportTicket"("tenantId", "estado", "createdAt");

CREATE TABLE "SupportTicketEvento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "texto" TEXT,
  "datos" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicketEvento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportTicketEvento_tenantId_ticketId_createdAt_idx" ON "SupportTicketEvento"("tenantId", "ticketId", "createdAt");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicketEvento" ADD CONSTRAINT "SupportTicketEvento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicketEvento" ADD CONSTRAINT "SupportTicketEvento_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "SupportTicket"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS en la misma migración (check-coverage.mjs, segunda red): cada negocio ve sólo sus tickets.
ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SupportTicket";
CREATE POLICY tenant_isolation ON "SupportTicket"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "SupportTicketEvento" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SupportTicketEvento";
CREATE POLICY tenant_isolation ON "SupportTicketEvento"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
