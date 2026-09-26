// ============================================================================
// LOS NEGOCIOS QUE RECORRE UN CRON — la única lectura que cruza negocios.
// ============================================================================
//
// Un cron no tiene pedido ni host: no hay "negocio del request". Recorre los negocios de la tabla
// `Tenant`, que no tiene RLS (prisma/rls/0001_enable_rls.sql la excluye a propósito), y todo lo de
// cada negocio lo lee y lo escribe PARADO EN ÉL: `tenantTransaction` con su id, que pone el GUC de
// RLS y el candado de la app.
//
// Nunca una lectura de todos los negocios a la vez sobre una tabla con `tenantId`: con una conexión
// sujeta a RLS —en producción lo están la de la app y también la de la consola
// (`OPERATOR_DATABASE_URL`, 26/09/2026)— esa lectura vuelve vacía y sin error. Así el barrido de
// recordatorios no encontraba ningún turno y el de ARCA no veía ningún envío (reproducido con
// `app_rls` en src/lib/cron/reminder-sweep-postgres.test.ts y
// src/lib/arca-procesador-sin-operador-postgres.test.ts).

import { basePrisma } from "@/lib/prisma-base";

/** Los ids de todos los negocios, del más antiguo al más nuevo (orden estable entre corridas). */
export async function idsDeLosNegocios(): Promise<string[]> {
  const filas = await basePrisma.tenant.findMany({
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return filas.map((f) => f.id);
}
