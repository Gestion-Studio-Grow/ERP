// Contexto de tenant por request — soporte para RLS (ADR-018, mecanismo B).
//
// Guarda el tenant del request en un AsyncLocalStorage para que la extensión de
// Prisma (src/lib/rls.ts) sepa qué inyectar en `app.current_tenant_id` sin pasarlo
// por parámetro por toda la app.
//
// USO: hoy el tenant lo resuelve la extensión sola vía getCurrentTenantId() (hay
// un solo tenant), así que envolver cada request con runInTenantContext NO es
// obligatorio — es un fast-path/preparación. El día del 2º tenant, la resolución
// por request (subdominio/sesión) setea el store acá y la extensión lo usa en vez
// de getCurrentTenantId (ADR-018 §4). `insideTx` lo usa tenantTransaction para que
// la extensión no intente anidar transacciones.

import { AsyncLocalStorage } from "node:async_hooks";

export type TenantStore = {
  tenantId: string;
  // true mientras corremos dentro de una transacción interactiva que YA seteó
  // el GUC (ver tenantTransaction en rls.ts). La extensión lo mira para no
  // abrir una transacción anidada (Postgres/pg no soporta anidar y explotaría).
  insideTx: boolean;
};

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Corre `fn` con el tenant `tenantId` en contexto. `insideTx` marca que ya
 * estamos dentro de una transacción que seteó el GUC (lo usa tenantTransaction).
 *
 * IMPORTANTE: `fn` debe ser ASYNC y AWAIT-ear su trabajo dentro del scope. Las
 * promesas de Prisma son lazy: un callback no-async que devuelve la promesa sin
 * await-earla la ejecuta DESPUÉS de que el contexto ALS ya salió → el store se
 * pierde. `async () => await prisma.x.op()` lo mantiene vivo. (Verificado en
 * prisma/rls/verify-wiring.mts.)
 */
export function runInTenantContext<T>(
  tenantId: string,
  fn: () => T,
  opts?: { insideTx?: boolean },
): T {
  return storage.run({ tenantId, insideTx: opts?.insideTx ?? false }, fn);
}

/** Store actual, o undefined si se llamó a Prisma fuera de un contexto de tenant. */
export function getTenantStore(): TenantStore | undefined {
  return storage.getStore();
}
