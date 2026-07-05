// Contexto de tenant por request — soporte para RLS (ADR-018, mecanismo B).
//
// ⚠ APAGADO POR DEFECTO. Este módulo es la mitad de app-level del backstop de
// RLS. Hoy NO está cableado al cliente vivo (src/lib/prisma.ts sigue exportando
// el cliente plano) porque RLS todavía no está aplicado a la DB (gate T2 =
// alta del 2º tenant, ver ADR-018 y prisma/rls/README.md). Existe escrito para
// que el día del gate la activación sea revisar-y-encender, no diseñar bajo
// presión.
//
// Qué hace: guarda el `tenantId` del request en un AsyncLocalStorage, para que
// la extensión de Prisma (src/lib/rls.ts) sepa qué valor inyectar en
// `app.current_tenant_id` sin pasarlo por parámetro por toda la app.
//
// De dónde sale el tenantId: de la resolución por request (subdominio/sesión)
// que reemplaza el `findMany take:2` de getCurrentTenantId() el día del gate
// (ADR-018 §4). Hasta entonces, con un solo tenant, sigue mandando tenant.ts.

import { AsyncLocalStorage } from "node:async_hooks";

export type TenantStore = {
  tenantId: string;
  // true mientras corremos dentro de una transacción interactiva que YA seteó
  // el GUC (ver tenantTransaction en rls.ts). La extensión lo mira para no
  // abrir una transacción anidada (Postgres/pg no soporta anidar y explotaría).
  insideTx: boolean;
};

const storage = new AsyncLocalStorage<TenantStore>();

/** Corre `fn` con el tenant `tenantId` en contexto. Envolvé cada request acá. */
export function runInTenantContext<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId, insideTx: false }, fn);
}

/** Store actual, o undefined si se llamó a Prisma fuera de un contexto de tenant. */
export function getTenantStore(): TenantStore | undefined {
  return storage.getStore();
}
