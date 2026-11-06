-- Matriz de permisos por usuario (docs/producto/permisos/PLAN.md §1). ADITIVA: sólo agrega una tabla;
-- no toca "User" ni el enum "UserRole". Sin aplicar (Gate 2): el código tolera su ausencia (P2021 → []).

CREATE TABLE "UserPermissionOverride" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPermissionOverride_userId_capability_key" ON "UserPermissionOverride"("userId", "capability");
CREATE INDEX "UserPermissionOverride_tenantId_idx" ON "UserPermissionOverride"("tenantId");

ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermissionOverride" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UserPermissionOverride";
CREATE POLICY tenant_isolation ON "UserPermissionOverride"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
