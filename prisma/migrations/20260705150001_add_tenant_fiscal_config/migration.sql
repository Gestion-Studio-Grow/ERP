-- Config fiscal / ARCA por tenant (ADR-022 §5, CORE-SCHEMA-SPEC opción B).
-- Solo metadata NO sensible: el certificado X.509 + clave del emisor entran por
-- env/secret store, nunca a la DB. Escrita a mano y verificada offline
-- (prisma validate); NO aplicada a Neon. Se aplica con `prisma migrate deploy`
-- (Gate 2 — requiere OK explícito). Aditivo/nullable → sin backfill.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "arcaCuit" TEXT,
ADD COLUMN     "arcaPuntoVenta" INTEGER,
ADD COLUMN     "arcaHomologacion" BOOLEAN NOT NULL DEFAULT true;
