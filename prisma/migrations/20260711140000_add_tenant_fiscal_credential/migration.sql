-- Credencial fiscal ARCA POR TENANT, cifrada en reposo (ADR-066).
--
-- Cierra la violación de tener el certificado del emisor en un env único compartido
-- (`ARCA_CERT_PEM`/`ARCA_KEY_PEM`): con un solo cert, todos los tenants firmarían con la
-- misma clave privada → contaminación fiscal cruzada. Esta tabla guarda el material
-- CIFRADO por tenant (envelope encryption; la master key vive en `FISCAL_MASTER_KEY`,
-- nunca en la DB). `certCuit`/`certNotAfter` son metadata NO sensible (guard + alertas).
--
-- TODO ADITIVO: 1 tabla nueva + FK. No toca ninguna tabla/fila viva. FK a Tenant
-- ON DELETE CASCADE (si se borra el tenant, se va su credencial). Aditivo/nullable en el
-- resto → sin backfill. Verificada OFFLINE (prisma validate + generate); NO aplicada a
-- Neon (§C · Gate 2 — requiere OK explícito con `prisma migrate deploy`).
-- ⚠️ RLS: TenantFiscalCredential tiene `tenantId` → re-ejecutar `prisma/rls/0001_enable_rls.sql`
--    (data-driven) tras esta migración, en el mismo deploy, para que la policy la aísle.
--    (El material igual solo se lee por `operatorPrisma`, plano de operador; RLS es defensa extra.)

-- CreateTable
CREATE TABLE "TenantFiscalCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "certCuit" TEXT NOT NULL,
    "certNotAfter" TIMESTAMP(3),
    "kekId" TEXT NOT NULL,
    "wrappedDek" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "loadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantFiscalCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantFiscalCredential_tenantId_key" ON "TenantFiscalCredential"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantFiscalCredential" ADD CONSTRAINT "TenantFiscalCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
