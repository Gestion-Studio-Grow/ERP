// Conexión de DB del PLANO DE OPERADOR (control-plane, ADR-021).
//
// SEPARACIÓN FÍSICA (propiedad de seguridad central de ADR-021): el acceso
// cross-tenant —el único que legítimamente ve/escribe a través de todos los tenants
// y, con RLS activo (ADR-018), lo evade— vive en una conexión PROPIA, distinta del
// Prisma Client que sirve a la app del tenant (`src/lib/prisma.ts`). La app que sirve
// tenants nunca tiene, en su proceso, el poder de saltear el aislamiento.
//
// HOY (pre-RLS, 1 tenant): esta conexión usa el mismo DATABASE_URL — la separación es
// de instancia/rol lógico. EL DÍA DE RLS (ADR-018): apuntar OPERATOR_DATABASE_URL a un
// rol con BYPASSRLS, y este cliente será el único que lo tenga. Ese es el punto de
// cambio, ya aislado acá.

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForOperator = globalThis as unknown as {
  operatorPrisma: PrismaClient | undefined;
};

const connectionString = process.env.OPERATOR_DATABASE_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });

export const operatorPrisma =
  globalForOperator.operatorPrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForOperator.operatorPrisma = operatorPrisma;
