-- CreateEnum
CREATE TYPE "TenantProfile" AS ENUM ('lite', 'enterprise');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "profile" "TenantProfile" NOT NULL DEFAULT 'lite';
