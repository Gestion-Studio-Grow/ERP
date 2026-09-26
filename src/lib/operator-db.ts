// Conexión de DB del PLANO DE OPERADOR (control-plane, ADR-021).
//
// SEPARACIÓN FÍSICA (propiedad de seguridad central de ADR-021): el acceso
// cross-tenant —el único que legítimamente ve/escribe a través de todos los tenants—
// vive en una conexión PROPIA, distinta del Prisma Client que sirve a la app del
// tenant (`src/lib/prisma.ts`).
//
// CON RLS (ADR-018), COMO CORRE HOY EN PRODUCCIÓN: esta conexión está SUJETA a RLS
// (medido el 26/09/2026: el alta de la consola falló con «new row violates row-level
// security policy for table "User"»). No se le da un rol con BYPASSRLS: la consola vive
// en el mismo deploy que la app de los negocios, y una credencial que saltea el
// aislamiento ahí adentro anula la separación. En cambio, TODO lo que la consola lee o
// escribe de UN negocio pasa por `enElNegocio`, que para la transacción en ese negocio.
// Con un rol exento no cambia nada; con `app_rls` es lo que deja ver sus filas y ninguna
// ajena. La tabla `Tenant` (sin RLS) se sigue leyendo directo.

import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForOperator = globalThis as unknown as {
  operatorPrisma: PrismaClient | undefined;
};

const connectionString = process.env.OPERATOR_DATABASE_URL ?? process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });

export const operatorPrisma =
  globalForOperator.operatorPrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForOperator.operatorPrisma = operatorPrisma;

/**
 * Una transacción del control-plane PARADA EN UN NEGOCIO: pone `app.current_tenant_id` local a
 * la transacción (`set_config(..., true)`, pooling-safe, ADR-018) antes de correr `fn`. Todo
 * lo de adentro va por la misma conexión: si algo falla, no queda nada escrito.
 */
export function enElNegocio<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  db: PrismaClient = operatorPrisma,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
