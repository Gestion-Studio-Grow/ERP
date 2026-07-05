-- Control-plane / operador (ADR-021): metadata de PLATAFORMA por tenant.
-- ADITIVA y segura: todas las columnas son nullable o tienen default, así los
-- tenants existentes quedan válidos sin backfill. NO aplicada a Neon todavía
-- (Gate 2 — requiere OK explícito; correr con `prisma migrate deploy`).

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "plan" TEXT,
ADD COLUMN     "blueprintId" TEXT,
ADD COLUMN     "subdomain" TEXT,
ADD COLUMN     "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "accentPreset" TEXT,
ADD COLUMN     "frontTheme" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_subdomain_key" ON "Tenant"("subdomain");
