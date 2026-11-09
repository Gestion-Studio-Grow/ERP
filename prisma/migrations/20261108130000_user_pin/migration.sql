-- PIN de desbloqueo de la sesión del panel (orden del dueño, 08/11/2026; src/lib/sesion-pin.ts). ADITIVA: sólo agrega
-- una tabla; no toca "User" ni datos. Sin aplicar (Gate 2): el código tolera su ausencia (P2021 → «sin PIN», se pide
-- la contraseña). Vuelta atrás: DROP TABLE "UserPin" (no hay otra cosa que dependa de ella).

CREATE TABLE "UserPin" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "pinHash" TEXT NOT NULL,
  "fallos" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserPin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPin_userId_key" ON "UserPin"("userId");
CREATE INDEX "UserPin_tenantId_idx" ON "UserPin"("tenantId");

ALTER TABLE "UserPin" ADD CONSTRAINT "UserPin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserPin" ADD CONSTRAINT "UserPin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPin" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "UserPin";
CREATE POLICY tenant_isolation ON "UserPin"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
