// Extensión de Prisma que inyecta el contexto de tenant para RLS (ADR-018, B).
//
// ⚠ APAGADO POR DEFECTO / NO CABLEADO. src/lib/prisma.ts exporta el cliente
// plano; este módulo NO se importa desde el runtime todavía. Se enciende el día
// del gate T2 (2º tenant, ADR-018) — junto con aplicar prisma/rls/0001+0002 y
// rotar DATABASE_URL a `app_user`. Hasta entonces existe escrito y revisado,
// no activo. Ver prisma/rls/README.md §"Adopción en la app".
//
// Mecanismo: cada operación de Prisma se envuelve en una transacción que primero
// setea `app.current_tenant_id` con set_config(..., true) (== SET LOCAL, pero
// parametrizable → pooling-safe). Las policies de 0001_enable_rls.sql filtran
// por ese GUC.
//
// PENDIENTE DE ADOPCIÓN (a hacer y verificar en la branch de Neon en el gate):
//   * Cablear runInTenantContext() en el borde del request (middleware/proxy o
//     wrapper de server actions), con el tenantId resuelto por subdominio/sesión.
//   * Reemplazar los ~12 `prisma.$transaction(async tx => …)` de src/lib/*.ts por
//     `tenantTransaction(tenantId, tx => …)` para que el GUC se setee como primer
//     statement de la transacción y NO se anide (ver `insideTx`).
//   * Ensayar TODO en branch con prisma/rls/verify-rls.mjs antes de tocar prod.

import { prisma } from "@/lib/prisma";
import { getTenantStore, runInTenantContext, type TenantStore } from "@/lib/tenant-context";

// Cliente extendido: úsalo en lugar de `prisma` una vez encendido el gate.
export const rlsPrisma = prisma.$extends({
  query: {
    async $allOperations({ args, query }) {
      const store = getTenantStore();
      if (!store) {
        // Fail-closed: nunca correr una query sin saber de qué tenant es.
        throw new Error(
          "RLS: operación de Prisma fuera de un contexto de tenant. " +
            "Envolvé el request con runInTenantContext(tenantId, …).",
        );
      }
      if (store.insideTx) {
        // Ya estamos dentro de una transacción que seteó el GUC (tenantTransaction):
        // correr directo, sin abrir otra transacción (no se puede anidar).
        return query(args);
      }
      // Op suelta: una transacción de 2 pasos — setear el GUC y correr la query.
      // set_config(..., true) es transaction-scoped ⇒ seguro con el pooler.
      const [, result] = await prisma.$transaction([
        prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${store.tenantId}, true)`,
        query(args),
      ]);
      return result;
    },
  },
});

// Transacción interactiva consciente de RLS: setea el GUC como primer statement
// y marca insideTx para que la extensión no anide. Usar en lugar de
// prisma.$transaction(async tx => …) en las server actions.
export async function tenantTransaction<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  const store: TenantStore = { tenantId, insideTx: true };
  return runInTenantContext(tenantId, () =>
    // Reusamos el store con insideTx=true sobrescribiendo el que crea runInTenantContext.
    // (runInTenantContext arranca insideTx=false; acá lo forzamos vía el objeto local.)
    prisma.$transaction(async (tx) => {
      Object.assign(getTenantStore() ?? store, { insideTx: true });
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    }),
  );
}
